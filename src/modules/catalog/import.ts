import { prisma } from "@/lib/db";
import { logAction } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import { Prisma, type Concept } from "@/generated/prisma/client";
import type { ImportOptions, ImportResult, ImportRow, Removal } from "@/lib/import-result";
import { ValidationError } from "@/lib/errors";
import { assertAdmin } from "@/modules/auth/permissions";
import { readCatalogSheet, type Column } from "./excel";
import { conceptInput } from "./schema";
import { conceptSnapshot, describeChanges, diffSnapshots, historyData, type ConceptSnapshot } from "./history";
import { kitsUsingConcepts, usedConceptIds } from "./usage";
import type { ConceptDetail } from "./service";

// Column that each validated field comes from, to prefix row errors.
const EMPTY = { rows: [], created: 0, updated: 0, unchanged: 0, removals: [], decisions: [], incompleteKits: [] };

const FIELD_COLUMN: Record<string, Column> = {
  code: "Codigo", categoryId: "Categoria", description: "Descripcion", unitId: "Unidad", taxId: "Impuesto",
  salePrice: "Precio_venta", cost: "Coste", listPrice: "PVP", discountPct: "Descuento_pct", notes: "Observaciones",
  manufacturer: "Fabricante", supplierRef: "Referencia_proveedor", supplier: "Proveedor",
};

function yesNo(value: string, empty: boolean): boolean | null {
  const v = value.trim().toUpperCase();
  if (v === "") return empty;
  if (v === "SI" || v === "SÍ") return true;
  if (v === "NO") return false;
  return null;
}

/**
 * Validates every row of a catalog workbook and, with `apply`, writes all of them in one transaction.
 * Any row error (or a file-level error) means nothing is written: all or nothing.
 */
export async function importConcepts(actor: CurrentUser, bytes: Uint8Array, opts: ImportOptions): Promise<ImportResult> {
  const full = opts.mode === "full";
  if (full) assertAdmin(actor);
  const sheet = await readCatalogSheet(bytes);
  if ("error" in sheet) return { error: sheet.error, ...EMPTY, applied: false };
  if (full && sheet.rows.length === 0) return { error: "El archivo no tiene filas: la importación completa lo borraría todo", ...EMPTY, applied: false };

  const [categories, units, taxes, concepts] = await Promise.all([
    prisma.category.findMany(), prisma.unit.findMany(), prisma.tax.findMany(), prisma.concept.findMany({ include: { category: true, unit: true, tax: true }, orderBy: { code: "asc" } }),
  ]);
  const byName = <T extends { name: string }>(rows: T[]) => new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
  const lookups = { categoryId: byName(categories), unitId: byName(units), taxId: byName(taxes) };
  const existing = new Map(concepts.map((c) => [c.code, c]));
  const firstRow = new Map<string, number>();

  const results: ImportRow[] = [];
  const writes: { current?: Concept; data: Prisma.ConceptUncheckedCreateInput; after: ConceptSnapshot; summary: string }[] = [];

  for (const { row, values, cellErrors } of sheet.rows) {
    const errors: string[] = [...cellErrors];
    const code = values.Codigo.trim().toUpperCase();
    const current = existing.get(code);
    if (code && firstRow.has(code)) errors.push(`Código repetido en la fila ${firstRow.get(code)}`);
    else if (code) firstRow.set(code, row);

    // Names → ids. An inactive one is only allowed if the concept already had it.
    const refs: Record<"categoryId" | "unitId" | "taxId", string> = { categoryId: "", unitId: "", taxId: "" };
    const labels = { categoryId: ["Categoría", values.Categoria], unitId: ["Unidad", values.Unidad], taxId: ["Impuesto", values.Impuesto] } as const;
    for (const field of ["categoryId", "unitId", "taxId"] as const) {
      const [label, name] = labels[field];
      const found = lookups[field].get(name.trim().toLowerCase());
      if (!found || (!found.active && found.id !== current?.[field])) errors.push(`${label} "${name}" no existe o está desactivada`);
      else refs[field] = found.id;
    }
    const active = yesNo(values.Activo, true);
    const validated = yesNo(values.Validado, false);
    if (active === null) errors.push("Activo: escribe SI o NO");
    if (validated === null) errors.push("Validado: escribe SI o NO");

    const parsed = conceptInput.safeParse({
      code, ...refs, description: values.Descripcion, salePrice: values.Precio_venta, cost: values.Coste,
      listPrice: values.PVP, discountPct: values.Descuento_pct, validated: validated ?? false, notes: values.Observaciones,
      manufacturer: values.Fabricante, supplierRef: values.Referencia_proveedor, supplier: values.Proveedor,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field in refs && errors.some((e) => e.startsWith(labels[field as keyof typeof labels][0]))) continue;
        errors.push(`${FIELD_COLUMN[field] ?? field}: ${issue.message}`);
      }
    }
    let action: ImportRow["action"] = current ? "update" : "create";
    let changes: string[] = [];
    if (parsed.success && errors.length === 0) {
      const data = { ...parsed.data, active: active ?? true };
      // Same normalisation as conceptSnapshot, so «16,75» and 16.7500 compare equal.
      const dec = (n: unknown) => (n == null ? null : new Prisma.Decimal(n as string | number).toFixed());
      const after: ConceptSnapshot = {
        code: data.code, description: data.description, category: lookups.categoryId.get(values.Categoria.trim().toLowerCase())!.name,
        unit: lookups.unitId.get(values.Unidad.trim().toLowerCase())!.name, tax: lookups.taxId.get(values.Impuesto.trim().toLowerCase())!.name,
        salePrice: dec(data.salePrice), cost: dec(data.cost), listPrice: dec(data.listPrice), discountPct: dec(data.discountPct),
        validated: data.validated, active: data.active, notes: data.notes, manufacturer: data.manufacturer,
        supplier: data.supplier, supplierRef: data.supplierRef,
      };
      const diff = current ? diffSnapshots(after, conceptSnapshot(current as ConceptDetail)) : [];
      if (current && diff.length === 0) action = "unchanged";
      else {
        changes = diff.map((c) => `${c.label}: ${c.before} → ${c.after}`);
        writes.push({ current, data, after, summary: current ? `${code}: ${describeChanges(diff)} (importación)` : `Alta de ${code}: ${data.description} (importación)` });
      }
    }
    results.push({ row, code, action, changes, errors });
  }

  const created = results.filter((r) => r.action === "create").length;
  const updated = results.filter((r) => r.action === "update").length;
  const unchanged = results.filter((r) => r.action === "unchanged").length;
  const ok = results.every((r) => r.errors.length === 0);

  // Full mode: concepts not in the file are deleted, or deactivated if used (already inactive and used: left alone).
  const inFile = new Set(results.map((r) => r.code));
  const absent = full ? concepts.filter((c) => !inFile.has(c.code)) : [];
  const removalsFor = (used: Set<string>): Removal[] => absent.filter((c) => c.active || !used.has(c.id)).map((c) => used.has(c.id)
    ? { kind: "concept", id: c.id, label: c.code, outcome: "deactivate", reason: "Está en uso" }
    : { kind: "concept", id: c.id, label: c.code, outcome: "delete", reason: "No se usa" });
  const incompleteFor = (tx: Prisma.TransactionClient | typeof prisma, removals: Removal[]) =>
    kitsUsingConcepts(tx, removals.filter((x) => x.outcome === "deactivate").map((x) => x.id));
  if (!opts.apply || !ok) {
    const removals = full ? removalsFor(await usedConceptIds(prisma)) : [];
    return { ...EMPTY, rows: results, created, updated, unchanged, removals, incompleteKits: full ? await incompleteFor(prisma, removals) : [], applied: false };
  }

  const done = await prisma.$transaction(async (tx) => {
    for (const { current, data, after, summary } of writes) {
      const saved = current ? await tx.concept.update({ where: { id: current.id }, data }) : await tx.concept.create({ data });
      await logAction(tx, {
        userId: actor.id, entity: "concept", entityId: saved.id, action: current ? "update" : "create", summary,
        data: { concept: after, source: "import" },
      });
    }
    // Recomputed here: something used since the review is deactivated, not deleted.
    const removals = full ? removalsFor(await usedConceptIds(tx)) : [];
    const byId = new Map(absent.map((c) => [c.id, c]));
    for (const { id, label, outcome } of removals) {
      const c = byId.get(id)!;
      if (outcome === "delete") await tx.concept.delete({ where: { id } });
      else await tx.concept.update({ where: { id }, data: { active: false } });
      await logAction(tx, {
        userId: actor.id, entity: "concept", entityId: id, action: outcome,
        summary: outcome === "delete" ? `Baja de ${label} (importación completa)` : `${label} desactivado (importación completa)`,
        data: historyData({ ...c, active: outcome === "delete" ? c.active : false }, "import-full"),
      });
    }
    const deleted = removals.filter((x) => x.outcome === "delete").length;
    await logAction(tx, {
      userId: actor.id, entity: "concept", entityId: "import", action: "import",
      summary: `Importación de catálogo: ${created} altas, ${updated} cambios, ${unchanged} sin cambios`
        + (full ? `, ${deleted} bajas, ${removals.length - deleted} desactivados` : ""),
    });
    return { removals, incompleteKits: full ? await incompleteFor(tx, removals) : [] };
  }, { timeout: 60_000 }).catch((error) => {
    // A failed DELETE aborts the whole transaction, so nothing is saved.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ValidationError({ _: "Algo ha cambiado mientras revisabas: vuelve a revisar el archivo" });
    }
    throw error;
  });
  return { ...EMPTY, rows: results, created, updated, unchanged, ...done, applied: true };
}

