import type { z } from "zod";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";
import { readClientsBook } from "./excel";
import { clientInput, contactInput, locationInput } from "./schema";

export type ClientImportRow = { sheet: "Clientes" | "Contactos" | "Instalaciones"; row: number; code: string; action: "create" | "update"; errors: string[] };
export type ClientImportResult = { error?: string; rows: ClientImportRow[]; created: number; updated: number; applied: boolean };

// Column that each validated field comes from, to prefix row errors.
const CLIENT_FIELD: Record<string, string> = {
  legalName: "Razon_social", taxId: "CIF", tradeName: "Nombre_comercial", fiscalAddress: "Direccion_fiscal",
  paymentTerms: "Forma_pago", exclusions: "Exclusiones", offerValidityDays: "Validez_dias", notes: "Observaciones",
};
const CHILD_FIELD: Record<string, string> = {
  name: "Nombre", role: "Cargo", email: "Email", phone: "Telefono", address: "Direccion", installation: "Instalacion", country: "Pais",
};

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
 * «Añadir y actualizar»: what is not in the file is left as it is. Any row error means nothing is written.
 */
export async function importClients(actor: CurrentUser, bytes: Uint8Array, opts: { apply: boolean }): Promise<ClientImportResult> {
  assertAdmin(actor);
  const book = await readClientsBook(bytes);
  if ("error" in book) return { error: book.error, rows: [], created: 0, updated: 0, applied: false };

  // Same order as the export (exportClients), so repeated names pair up row by row.
  const order = [{ active: "desc" }, { name: "asc" }, { id: "asc" }] satisfies Prisma.ClientContactOrderByWithRelationInput[];
  const existing = new Map((await prisma.client.findMany({ include: { contacts: { orderBy: order }, locations: { orderBy: order } } })).map((c) => [c.taxId, c]));
  const results: ClientImportRow[] = [];
  const clientWrites: { id?: string; data: z.output<typeof clientInput> & { active: boolean } }[] = [];
  const inSheet = new Map<string, number>();

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
    results.push({ sheet: "Clientes", row, code: cif, action: current ? "update" : "create", errors });
    if (parsed.success && errors.length === 0) clientWrites.push({ id: current?.id, data: { ...parsed.data, active } });
  }

  const children = <C extends string, T extends { name: string }>(
    sheet: "Contactos" | "Instalaciones",
    rows: { row: number; values: Record<C | "CIF" | "Nombre" | "Activo", string>; cellErrors: string[] }[],
    parse: (values: Record<C | "CIF" | "Nombre" | "Activo", string>, name: string) => Parsed<T>,
    list: (client: NonNullable<ReturnType<typeof existing.get>>) => { id: string; name: string }[],
  ) => {
    const what = sheet === "Contactos" ? "contactos" : "instalaciones";
    const writes: { cif: string; id?: string; data: T & { active: boolean } }[] = [];
    const keyOf = (v: { CIF: string; Nombre: string }) => `${normCif(v.CIF)} · ${v.Nombre.trim().toLowerCase()}`;
    const inFile = new Map<string, number>();
    rows.forEach(({ values }) => inFile.set(keyOf(values), (inFile.get(keyOf(values)) ?? 0) + 1));
    const seen = new Map<string, number[]>();
    for (const { row, values, cellErrors } of rows) {
      const errors = [...cellErrors];
      const cif = normCif(values.CIF);
      const name = values.Nombre.trim();
      if (!cif) errors.push("CIF: escribe el CIF del cliente");
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
      results.push({ sheet, row, code: name ? `${cif} · ${name}` : cif, action: match ? "update" : "create", errors });
      if (parsed.success && errors.length === 0) writes.push({ cif, id: match?.id, data: { ...parsed.data, active } });
    }
    return writes;
  };
  const contactWrites = children("Contactos", book.contacts,
    (v, name) => contactInput.safeParse({ name, role: v.Cargo, email: v.Email, phone: v.Telefono }), (c) => c.contacts);
  const locationWrites = children("Instalaciones", book.locations,
    (v, name) => locationInput.safeParse({ name, address: v.Direccion, installation: v.Instalacion, country: v.Pais }), (c) => c.locations);

  const created = results.filter((r) => r.action === "create").length;
  const updated = results.length - created;
  const ok = results.every((r) => r.errors.length === 0);
  if (!opts.apply || !ok) return { rows: results, created, updated, applied: false };

  const log = (tx: Prisma.TransactionClient, entityId: string, action: string, summary: string) =>
    logAction(tx, { userId: actor.id, entity: "client", entityId, action, summary: `${summary} (importación)` });
  try {
    await prisma.$transaction(async (tx) => {
      const clients = new Map([...existing.values()].map((c) => [c.taxId, { id: c.id, legalName: c.legalName }]));
      for (const { id, data } of clientWrites) {
        const c = id ? await tx.client.update({ where: { id }, data }) : await tx.client.create({ data });
        clients.set(c.taxId, { id: c.id, legalName: c.legalName });
        await log(tx, c.id, id ? "update" : "create", id ? `${c.legalName}: datos actualizados` : `Alta de ${c.legalName} (${c.taxId})`);
      }
      for (const { cif, id, data } of contactWrites) {
        const c = clients.get(cif)!;
        if (id) await tx.clientContact.update({ where: { id }, data: { ...data, name: undefined } }); // matched ignoring case: keep the stored name
        else await tx.clientContact.create({ data: { ...data, clientId: c.id } });
        await log(tx, c.id, id ? "update" : "create", `${c.legalName}: contacto ${data.name} ${id ? "modificado" : "añadido"}`);
      }
      for (const { cif, id, data } of locationWrites) {
        const c = clients.get(cif)!;
        if (id) await tx.clientLocation.update({ where: { id }, data: { ...data, name: undefined } });
        else await tx.clientLocation.create({ data: { ...data, clientId: c.id } });
        await log(tx, c.id, id ? "update" : "create", `${c.legalName}: instalación ${data.name} ${id ? "modificada" : "añadida"}`);
      }
      await logAction(tx, {
        userId: actor.id, entity: "client", entityId: "import", action: "import", summary: `Importación de clientes: ${created} altas, ${updated} cambios`,
      });
    }, { timeout: 60_000 });
  } catch (error) {
    // Another user created one of these CIFs between the check and the write.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidationError({ _: "Otro usuario ha dado de alta uno de estos CIF mientras tanto: vuelve a revisar el archivo" });
    }
    throw error;
  }
  return { rows: results, created, updated, applied: true };
}
