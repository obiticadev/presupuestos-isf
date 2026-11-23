import type { z } from "zod";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import type { ClientDecision, ImportOptions, ImportResult, ImportRow, Removal } from "@/lib/import-result";
import { assertAdmin } from "@/modules/auth/permissions";
import { readClientsBook } from "./excel";
import { clientInput, contactInput, locationInput } from "./schema";

const EMPTY = { rows: [], created: 0, updated: 0, unchanged: 0, removals: [], decisions: [], incompleteKits: [] };

// Column that each validated field comes from, to prefix row errors.
const CLIENT_FIELD: Record<string, string> = {
  legalName: "Razon_social", taxId: "CIF", tradeName: "Nombre_comercial", fiscalAddress: "Direccion_fiscal",
  paymentTerms: "Forma_pago", exclusions: "Exclusiones", offerValidityDays: "Validez_dias", notes: "Observaciones",
};
const CHILD_FIELD: Record<string, string> = {
  name: "Nombre", role: "Cargo", email: "Email", phone: "Telefono", address: "Direccion", installation: "Instalacion", country: "Pais",
};

const CLIENT_LABEL: Record<string, string> = {
  legalName: "Razón social", tradeName: "Nombre comercial", fiscalAddress: "Dirección fiscal", paymentTerms: "Forma de pago",
  exclusions: "Exclusiones", offerValidityDays: "Validez (días)", notes: "Observaciones", active: "Activo",
};
const CONTACT_LABEL: Record<string, string> = { role: "Cargo", email: "Email", phone: "Teléfono", active: "Activo" };
const LOCATION_LABEL: Record<string, string> = { address: "Dirección", installation: "Instalación", country: "País", active: "Activo" };

const show = (v: unknown) => (typeof v === "boolean" ? (v ? "sí" : "no") : v == null || v === "" ? "vacío" : String(v));
/** «Campo: antes → después» for each labelled field that differs. */
const changedFields = (before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): string[] =>
  Object.keys(labels).filter((k) => show(before[k]) !== show(after[k])).map((k) => `${labels[k]}: ${show(before[k])} → ${show(after[k])}`);

const normCif = (s: string) => s.replace(/[\s.-]/g, "").toUpperCase();
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function yesNo(value: string, errors: string[]): boolean {
  const v = value.trim().toUpperCase();
  if (v === "" || v === "SI" || v === "SÍ") return true;
  if (v !== "NO") errors.push("Activo: escribe SI o NO");
  return false;
}

const issues = (error: z.ZodError, columns: Record<string, string>) =>
  error.issues.map((i) => `${columns[String(i.path[0])] ?? String(i.path[0])}: ${i.message}`);

type Parsed<T> = { success: true; data: T } | { success: false; error: z.ZodError };

/**
 * Validates the three sheets of a clients workbook and, with `apply`, writes them in one transaction (spec 2.2).
 * «Añadir y actualizar»: what is not in the file is left as it is. «Completa» (admin only, spec 3.2): what is not in the file
 * is deleted, or deactivated if a quote uses it; clients in `keep` are left untouched. Any row error means nothing is written.
 */
export async function importClients(actor: CurrentUser, bytes: Uint8Array, opts: ImportOptions): Promise<ImportResult> {
  const full = opts.mode === "full";
  if (full) assertAdmin(actor);
  const book = await readClientsBook(bytes);
  if ("error" in book) return { error: book.error, ...EMPTY, applied: false };
  if (full && book.clients.length === 0) return { error: "El archivo no tiene filas: la importación completa lo borraría todo", ...EMPTY, applied: false };

  // Same order as the export (exportClients), so repeated names pair up row by row.
  const order = [{ active: "desc" }, { name: "asc" }, { id: "asc" }] satisfies Prisma.ClientContactOrderByWithRelationInput[];
  const existing = new Map((await prisma.client.findMany({ include: { contacts: { orderBy: order }, locations: { orderBy: order } } })).map((c) => [c.taxId, c]));
  const results: ImportRow[] = [];
  const clientWrites: { id?: string; data: z.output<typeof clientInput> & { active: boolean }; changes: string[] }[] = [];
  const inSheet = new Map<string, number>();
  const matched = new Set<string>(); // stored contacts and locations that a row pairs with

  for (const { row, values, cellErrors } of book.clients) {
    const errors = [...cellErrors];
    const cif = normCif(values.CIF);
    if (cif && inSheet.has(cif)) errors.push(`CIF repetido en la fila ${inSheet.get(cif)}`);
    else if (cif) inSheet.set(cif, row);
    const active = yesNo(values.Activo, errors);
    const parsed = clientInput.safeParse({
      legalName: values.Razon_social, taxId: values.CIF, tradeName: values.Nombre_comercial, fiscalAddress: values.Direccion_fiscal,
      paymentTerms: values.Forma_pago, exclusions: values.Exclusiones, offerValidityDays: values.Validez_dias, notes: values.Observaciones,
    });
    if (!parsed.success) errors.push(...issues(parsed.error, CLIENT_FIELD));
    const current = existing.get(cif);
    let action: ImportRow["action"] = current ? "update" : "create";
    let changes: string[] = [];
    if (parsed.success && errors.length === 0) {
      const data = { ...parsed.data, active };
      changes = current ? changedFields(current, data, CLIENT_LABEL) : [];
      if (current && changes.length === 0) action = "unchanged";
      else clientWrites.push({ id: current?.id, data, changes });
    }
    results.push({ sheet: "Clientes", row, code: cif, action, changes, errors });
  }

  const children = <C extends string, T extends { name: string }>(
    sheet: "Contactos" | "Instalaciones",
    rows: { row: number; values: Record<C | "CIF" | "Nombre" | "Activo", string>; cellErrors: string[] }[],
    parse: (values: Record<C | "CIF" | "Nombre" | "Activo", string>, name: string) => Parsed<T>,
    list: (client: NonNullable<ReturnType<typeof existing.get>>) => ({ id: string; name: string } & Record<string, unknown>)[],
    labels: Record<string, string>,
  ) => {
    const what = sheet === "Contactos" ? "contactos" : "instalaciones";
    const writes: { cif: string; id?: string; data: T & { active: boolean }; changes: string[] }[] = [];
    const keyOf = (v: { CIF: string; Nombre: string }) => `${normCif(v.CIF)} · ${v.Nombre.trim().toLowerCase()}`;
    const inFile = new Map<string, number>();
    rows.forEach(({ values }) => inFile.set(keyOf(values), (inFile.get(keyOf(values)) ?? 0) + 1));
    const seen = new Map<string, number[]>();
    for (const { row, values, cellErrors } of rows) {
      const errors = [...cellErrors];
      const cif = normCif(values.CIF);
      const name = values.Nombre.trim();
      if (!cif) errors.push("CIF: escribe el CIF del cliente");
      else if (full && !inSheet.has(cif)) errors.push(`El CIF ${cif} no está en la hoja Clientes`); // that client is going away
      else if (!inSheet.has(cif) && !existing.has(cif)) errors.push(`El CIF ${cif} no está en la hoja Clientes ni en la base`);
      const key = keyOf(values);
      const before = seen.get(key) ?? [];
      seen.set(key, [...before, row]);
      const active = yesNo(values.Activo, errors);
      const parsed = parse(values, name);
      if (!parsed.success) errors.push(...issues(parsed.error, CHILD_FIELD));
      const client = existing.get(cif);
      const matches = client ? list(client).filter((x) => sameName(x.name, name)) : [];
      // Several stored with this name (say, one deactivated and a new one): the file must bring one row for each, in export order.
      if (matches.length > 1 && inFile.get(key) !== matches.length) errors.push(`Hay varios ${what} con ese nombre en el cliente: renómbralos antes`);
      else if (matches.length <= 1 && before.length > 0) errors.push(`Repetido en la fila ${before[0]}`);
      const match = matches.length > 1 ? matches[before.length] : before.length === 0 ? matches[0] : undefined;
      if (match) matched.add(match.id);
      let action: ImportRow["action"] = match ? "update" : "create";
      let changes: string[] = [];
      if (parsed.success && errors.length === 0) {
        const data = { ...parsed.data, active };
        changes = match ? changedFields(match, data, labels) : [];
        if (match && changes.length === 0) action = "unchanged";
        else writes.push({ cif, id: match?.id, data, changes });
      }
      results.push({ sheet, row, code: name ? `${cif} · ${name}` : cif, action, changes, errors });
    }
    return writes;
  };
  const contactWrites = children("Contactos", book.contacts,
    (v, name) => contactInput.safeParse({ name, role: v.Cargo, email: v.Email, phone: v.Telefono }), (c) => c.contacts, CONTACT_LABEL);
  const locationWrites = children("Instalaciones", book.locations,
    (v, name) => locationInput.safeParse({ name, address: v.Direccion, installation: v.Instalacion, country: v.Pais }), (c) => c.locations, LOCATION_LABEL);

  const created = results.filter((r) => r.action === "create").length;
  const updated = results.filter((r) => r.action === "update").length;
  const unchanged = results.filter((r) => r.action === "unchanged").length;
  const ok = results.every((r) => r.errors.length === 0);

  // Full mode. A client without quotes is deleted (contacts and locations go by Cascade); one with quotes is a decision and,
  // unless kept, deactivated. Absent contacts and locations of the rest: deactivated if a quote uses them, deleted if not.
  // Already inactive and used: neither counted nor touched.
  const keep = new Set(opts.keep ?? []);
  const removalsFor = async (db: Prisma.TransactionClient | typeof prisma) => {
    const removals: Removal[] = [];
    const decisions: ClientDecision[] = [];
    if (!full) return { removals, decisions };
    const quotes = await db.quote.findMany({ select: { clientId: true, contactId: true, locationId: true, status: true } });
    const used = new Set(quotes.flatMap((q) => [q.contactId, q.locationId]));
    for (const c of existing.values()) {
      if (!inSheet.has(c.taxId)) {
        const qs = quotes.filter((q) => q.clientId === c.id);
        if (qs.length > 0) decisions.push({ id: c.id, label: c.legalName, taxId: c.taxId, quotes: qs.length, drafts: qs.filter((q) => q.status === "DRAFT").length });
        if (keep.has(c.id)) continue;
        if (qs.length === 0) {
          removals.push({ kind: "client", id: c.id, label: c.legalName, outcome: "delete", reason: "No se usa" });
          continue;
        }
        if (c.active) removals.push({ kind: "client", id: c.id, label: c.legalName, outcome: "deactivate", reason: `Está en uso (${qs.length} presupuestos)` });
      }
      for (const [kind, what, list] of [["contact", "contacto", c.contacts], ["location", "instalación", c.locations]] as const) {
        for (const x of list.filter((x) => !matched.has(x.id) && (x.active || !used.has(x.id)))) {
          removals.push({ kind, id: x.id, label: `${c.legalName}: ${what} ${x.name}`, ...(used.has(x.id)
            ? { outcome: "deactivate", reason: "Está en uso" } : { outcome: "delete", reason: "No se usa" }) });
        }
      }
    }
    return { removals, decisions };
  };
  if (!opts.apply || !ok) return { ...EMPTY, rows: results, created, updated, unchanged, ...(await removalsFor(prisma)), applied: false };
  const clientOf = new Map([...existing.values()].flatMap((c) => [c, ...c.contacts, ...c.locations].map((x) => [x.id, c.id])));

  const log = (tx: Prisma.TransactionClient, entityId: string, action: string, summary: string) =>
    logAction(tx, { userId: actor.id, entity: "client", entityId, action, summary: `${summary} (importación)` });
  let done;
  try {
    done = await prisma.$transaction(async (tx) => {
      const clients = new Map([...existing.values()].map((c) => [c.taxId, { id: c.id, legalName: c.legalName }]));
      for (const { id, data, changes } of clientWrites) {
        const c = id ? await tx.client.update({ where: { id }, data }) : await tx.client.create({ data });
        clients.set(c.taxId, { id: c.id, legalName: c.legalName });
        await log(tx, c.id, id ? "update" : "create", id ? `${c.legalName}: ${changes.join("; ")}` : `Alta de ${c.legalName} (${c.taxId})`);
      }
      for (const { cif, id, data, changes } of contactWrites) {
        const c = clients.get(cif)!;
        if (id) await tx.clientContact.update({ where: { id }, data: { ...data, name: undefined } }); // matched ignoring case: keep the stored name
        else await tx.clientContact.create({ data: { ...data, clientId: c.id } });
        await log(tx, c.id, id ? "update" : "create", `${c.legalName}: contacto ${data.name} ${id ? `modificado (${changes.join("; ")})` : "añadido"}`);
      }
      for (const { cif, id, data, changes } of locationWrites) {
        const c = clients.get(cif)!;
        if (id) await tx.clientLocation.update({ where: { id }, data: { ...data, name: undefined } });
        else await tx.clientLocation.create({ data: { ...data, clientId: c.id } });
        await log(tx, c.id, id ? "update" : "create", `${c.legalName}: instalación ${data.name} ${id ? `modificada (${changes.join("; ")})` : "añadida"}`);
      }
      // Recomputed here: a client or contact used since the review is deactivated, not deleted.
      const done = await removalsFor(tx);
      for (const { kind, id, label, outcome } of done.removals) {
        const where = { where: { id } };
        if (kind === "client") await (outcome === "delete" ? tx.client.delete(where) : tx.client.update({ ...where, data: { active: false } }));
        else if (kind === "contact") await (outcome === "delete" ? tx.clientContact.delete(where) : tx.clientContact.update({ ...where, data: { active: false } }));
        else await (outcome === "delete" ? tx.clientLocation.delete(where) : tx.clientLocation.update({ ...where, data: { active: false } }));
        await logAction(tx, {
          userId: actor.id, entity: "client", entityId: clientOf.get(id)!, action: outcome,
          summary: outcome === "delete" ? `Baja de ${label} (importación completa)` : `${label} ${kind === "location" ? "desactivada" : "desactivado"} (importación completa)`,
        });
      }
      const deleted = done.removals.filter((x) => x.outcome === "delete").length;
      await logAction(tx, {
        userId: actor.id, entity: "client", entityId: "import", action: "import",
        summary: `Importación de clientes: ${created} altas, ${updated} cambios, ${unchanged} sin cambios`
          + (full ? `, ${deleted} bajas, ${done.removals.length - deleted} desactivados` : ""),
      });
      return done;
    }, { timeout: 60_000 });
  } catch (error) {
    // Another user created one of these CIFs between the check and the write.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidationError({ _: "Otro usuario ha dado de alta uno de estos CIF mientras tanto: vuelve a revisar el archivo" });
    }
    // A delete hit a reference (P2003) or a row vanished (P2025): the transaction is aborted, so nothing is saved.
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2003" || error.code === "P2025")) {
      throw new ValidationError({ _: "Algo ha cambiado mientras revisabas: vuelve a revisar el archivo" });
    }
    throw error;
  }
  return { ...EMPTY, rows: results, created, updated, unchanged, ...done, applied: true };
}
