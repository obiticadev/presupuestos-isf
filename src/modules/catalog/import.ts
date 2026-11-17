import { prisma } from "@/lib/db";
import { logAction } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import type { Concept, Prisma } from "@/generated/prisma/client";
import { readCatalogSheet, type Column } from "./excel";
import { conceptInput } from "./schema";
import { changeSummary } from "./service";

export type ImportRow = { row: number; code: string; action: "create" | "update"; errors: string[] };
export type ImportResult = { error?: string; rows: ImportRow[]; created: number; updated: number; applied: boolean };

// Column that each validated field comes from, to prefix row errors.
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
export async function importConcepts(actor: CurrentUser, bytes: Uint8Array, opts: { apply: boolean }): Promise<ImportResult> {
  const sheet = await readCatalogSheet(bytes);
  if ("error" in sheet) return { error: sheet.error, rows: [], created: 0, updated: 0, applied: false };

  const [categories, units, taxes, concepts] = await Promise.all([
    prisma.category.findMany(), prisma.unit.findMany(), prisma.tax.findMany(), prisma.concept.findMany(),
  ]);
  const byName = <T extends { name: string }>(rows: T[]) => new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
  const lookups = { categoryId: byName(categories), unitId: byName(units), taxId: byName(taxes) };
  const existing = new Map(concepts.map((c) => [c.code, c]));
  const firstRow = new Map<string, number>();

  const results: ImportRow[] = [];
  const writes: { current?: Concept; data: Prisma.ConceptUncheckedCreateInput }[] = [];

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
    results.push({ row, code, action: current ? "update" : "create", errors });
    if (parsed.success && errors.length === 0) {
      writes.push({ current, data: { ...parsed.data, active: active ?? true } });
    }
  }

  const created = results.filter((r) => r.action === "create").length;
  const updated = results.length - created;
  const ok = results.every((r) => r.errors.length === 0);
  if (!opts.apply || !ok) return { rows: results, created, updated, applied: false };

  await prisma.$transaction(async (tx) => {
    for (const { current, data } of writes) {
      if (current) {
        const after = await tx.concept.update({ where: { id: current.id }, data });
        await logAction(tx, { userId: actor.id, entity: "concept", entityId: after.id, action: "update", summary: `${changeSummary(current, after)} (importación)` });
      } else {
        const c = await tx.concept.create({ data });
        await logAction(tx, { userId: actor.id, entity: "concept", entityId: c.id, action: "create", summary: `Alta de ${c.code}: ${c.description} (importación)` });
      }
    }
    await logAction(tx, {
      userId: actor.id, entity: "concept", entityId: "import", action: "import",
      summary: `Importación de catálogo: ${created} altas, ${updated} cambios`,
    });
  }, { timeout: 60_000 });
  return { rows: results, created, updated, applied: true };
}

