import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { CLIENT_COLUMNS, CONTACT_COLUMNS, LOCATION_COLUMNS, readClientsBook, writeClientsBook } from "@/modules/clients/excel";
import { importClients } from "@/modules/clients/import";
import { createClient, exportClients, getClient, saveContact, saveLocation, setClientActive } from "@/modules/clients/service";
import { issueChecks } from "@/modules/quotes/issue";
import { getQuote, listRequiredConcepts } from "@/modules/quotes/service";
import { completeDraft } from "../helpers/quotes";
import { makeUser } from "../helpers/users";

type Sheets = { Clientes?: Record<string, unknown>[]; Contactos?: Record<string, unknown>[]; Instalaciones?: Record<string, unknown>[] };
const HEADERS = { Clientes: CLIENT_COLUMNS, Contactos: CONTACT_COLUMNS, Instalaciones: LOCATION_COLUMNS } as const;

/** An .xlsx with the three sheets; rows are objects keyed by column, missing keys are empty. */
async function book(sheets: Sheets, drop: { sheet?: keyof Sheets; column?: [keyof Sheets, string] } = {}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const name of ["Clientes", "Contactos", "Instalaciones"] as const) {
    if (drop.sheet === name) continue;
    const cols = HEADERS[name].filter((c) => !(drop.column?.[0] === name && drop.column[1] === c));
    const ws = wb.addWorksheet(name);
    ws.addRow([...cols]);
    for (const r of sheets[name] ?? []) ws.addRow(cols.map((c) => r[c] ?? null));
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
const cliente = (o: Record<string, unknown> = {}) => ({ CIF: "B12345678", Razon_social: "Aguas del Sur, S.A.", Forma_pago: "30 días", ...o });

/** Every stored field, without ids or dates, to compare before and after a round trip. */
const omit = (o: object, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const snapshot = async () => (await exportClients()).map((c) => ({
  ...omit(c, ["id", "createdAt", "updatedAt"]),
  contacts: c.contacts.map((x) => omit(x, ["id", "clientId"])),
  locations: c.locations.map((x) => omit(x, ["id", "clientId"])),
}));

test("exportar e importar sin cambios da todo sin cambios, sin errores", async () => {
  const admin = await makeUser("admin");
  const a = await createClient(admin, { legalName: "Aguas del Sur, S.A.", taxId: "B12345678", offerValidityDays: "30", paymentTerms: "30 días\nTransferencia" });
  const b = await createClient(admin, { legalName: "Conservas Ribera", taxId: "A28000000" });
  for (const c of [a, b]) {
    await saveContact(admin, c.id, { name: "Ana López", role: "Jefa", email: "ana@ejemplo.es", phone: "600000001" });
    await saveLocation(admin, c.id, { name: "Planta", address: "Ctra. 4", installation: "EDAR Sur", country: "España" });
  }
  await setClientActive(admin, b.id, false);
  const before = await snapshot();
  const r = await importClients(admin, await writeClientsBook(await exportClients()), { apply: true });
  expect(r.error).toBeUndefined();
  expect(r.rows.flatMap((x) => x.errors)).toEqual([]);
  expect([r.created, r.updated, r.unchanged, r.applied]).toEqual([0, 0, 6, true]);
  expect(await snapshot()).toEqual(before);
});

test("la plantilla tiene las cuatro hojas con sus cabeceras y sin filas", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await writeClientsBook([])).buffer as ArrayBuffer);
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Clientes", "Contactos", "Instalaciones", "Instrucciones"]);
  const sheet = await readClientsBook(await writeClientsBook([]));
  expect(sheet).toEqual({ clients: [], contacts: [], locations: [] });
  expect(wb.getWorksheet("Contactos")!.getRow(1).values).toEqual([undefined, ...CONTACT_COLUMNS, "Razon_social"]);
});

test("en Contactos e Instalaciones el CIF se elige de una lista con los CIF de Clientes", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await writeClientsBook([])).buffer as ArrayBuffer);
  for (const name of ["Contactos", "Instalaciones"]) {
    const v = wb.getWorksheet(name)!.getCell("A2").dataValidation;
    expect(v.type).toBe("list");
    expect(v.formulae?.[0]).toBe("Clientes!$A$2:$A$5001");
  }
});

test("un alta crea el cliente con su contacto y su instalación", async () => {
  const admin = await makeUser("admin");
  const r = await importClients(admin, await book({
    Clientes: [cliente({ CIF: "b-12 345.678", Validez_dias: 45 })],
    Contactos: [{ CIF: "B12345678", Nombre: "Laura", Email: "laura@ejemplo.es", Telefono: 600000002 }],
    Instalaciones: [{ CIF: "B12345678", Nombre: "EDAR", Direccion: "Camino 1", Instalacion: "Depuradora", Pais: "Portugal" }],
  }), { apply: true });
  expect(r.rows.flatMap((x) => x.errors)).toEqual([]);
  expect([r.created, r.updated]).toEqual([3, 0]);
  const c = await getClient((await prisma.client.findUniqueOrThrow({ where: { taxId: "B12345678" } })).id);
  expect(c.offerValidityDays).toBe(45);
  expect([c.contacts[0].email, c.contacts[0].phone]).toEqual(["laura@ejemplo.es", "600000002"]);
  expect([c.locations[0].installation, c.locations[0].country]).toEqual(["Depuradora", "Portugal"]);
});

test("un contacto de un cliente que solo está en la base casa por CIF + nombre y lo actualiza", async () => {
  const admin = await makeUser("admin");
  const c = await createClient(admin, { legalName: "Aguas del Sur", taxId: "B12345678" });
  await saveContact(admin, c.id, { name: "Ana López", role: "Técnica", email: "" });
  const r = await importClients(admin, await book({ Contactos: [{ CIF: "B-12345678", Nombre: " ana lópez ", Cargo: "Jefa de planta" }] }), { apply: true });
  expect(r.rows.map((x) => [x.sheet, x.action, x.errors])).toEqual([["Contactos", "update", []]]);
  const d = await getClient(c.id);
  expect(d.contacts.map((x) => [x.name, x.role])).toEqual([["Ana López", "Jefa de planta"]]);
});

test("un CIF que no está ni en Clientes ni en la base es un error y no se guarda nada", async () => {
  const admin = await makeUser("admin");
  const r = await importClients(admin, await book({
    Clientes: [cliente()],
    Contactos: [{ CIF: "X999", Nombre: "Nadie" }],
  }), { apply: true });
  expect(r.applied).toBe(false);
  expect(r.rows.find((x) => x.sheet === "Contactos")?.errors).toEqual(["El CIF X999 no está en la hoja Clientes ni en la base"]);
  expect(await prisma.client.count({ where: { taxId: "B12345678" } })).toBe(0);
});

test("filas repetidas: CIF en Clientes y CIF + nombre en Instalaciones", async () => {
  const admin = await makeUser("admin");
  const r = await importClients(admin, await book({
    Clientes: [cliente(), cliente({ CIF: "B-12345678" })],
    Instalaciones: [{ CIF: "B12345678", Nombre: "EDAR" }, { CIF: "B12345678", Nombre: "edar" }],
  }), { apply: false });
  expect(r.rows.find((x) => x.sheet === "Clientes" && x.row === 3)?.errors).toEqual(["CIF repetido en la fila 2"]);
  expect(r.rows.find((x) => x.sheet === "Instalaciones" && x.row === 3)?.errors).toEqual(["Repetido en la fila 2"]);
});

test("dos contactos con el mismo nombre en la base hacen ambigua la fila", async () => {
  const admin = await makeUser("admin");
  const c = await createClient(admin, { legalName: "Aguas del Sur", taxId: "B12345678" });
  await saveContact(admin, c.id, { name: "Ana", email: "" });
  await saveContact(admin, c.id, { name: "Ana", email: "" });
  const r = await importClients(admin, await book({ Contactos: [{ CIF: "B12345678", Nombre: "Ana" }] }), { apply: false });
  expect(r.rows[0].errors).toEqual(["Hay varios contactos con ese nombre en el cliente: renómbralos antes"]);
});

test("validez, email y Activo mal escritos dan error de su columna", async () => {
  const admin = await makeUser("admin");
  const r = await importClients(admin, await book({
    Clientes: [cliente({ Validez_dias: "400", Activo: "quizá" })],
    Contactos: [{ CIF: "B12345678", Nombre: "Ana", Email: "no" }],
  }), { apply: false });
  expect(r.rows[0].errors).toEqual(["Activo: escribe SI o NO", "Validez_dias: Entre 1 y 365 días, o vacío para usar el valor por defecto"]);
  expect(r.rows[1].errors).toEqual(["Email: Email no válido"]);
});

test("Activo NO desactiva una instalación usada por un borrador; el borrador avisa", async () => {
  const { admin, client, location, quote } = await completeDraft();
  const r = await importClients(admin, await book({ Instalaciones: [{ CIF: client.taxId, Nombre: location.name, Activo: "NO" }] }), { apply: true });
  expect(r.applied).toBe(true);
  expect((await prisma.clientLocation.findUniqueOrThrow({ where: { id: location.id } })).active).toBe(false);
  expect(issueChecks(await getQuote(quote.id), await listRequiredConcepts()).map((p) => p.code)).toContain("location");
});

test("falta una hoja o una columna", async () => {
  const admin = await makeUser("admin");
  expect((await importClients(admin, await book({}, { sheet: "Contactos" }), { apply: false })).error).toBe("Falta la hoja Contactos");
  expect((await importClients(admin, await book({}, { column: ["Instalaciones", "Pais"] }), { apply: false })).error)
    .toBe("Falta la columna Pais en la hoja Instalaciones");
  expect((await importClients(admin, new Uint8Array([1, 2, 3]), { apply: false })).error).toBe("El archivo no es un Excel (.xlsx) válido");
});

test("un presupuestador puede importar", async () => {
  const p = await makeUser("presupuestador");
  expect((await importClients(p, await book({ Clientes: [cliente()] }), { apply: true })).applied).toBe(true);
});

test("la importación queda en el historial", async () => {
  const admin = await makeUser("admin");
  await importClients(admin, await book({ Clientes: [cliente()] }), { apply: true });
  const logs = await prisma.auditLog.findMany({ where: { entity: "client" }, select: { summary: true } });
  expect(logs.map((l) => l.summary)).toEqual(expect.arrayContaining(["Alta de Aguas del Sur, S.A. (B12345678) (importación)", "Importación de clientes: 1 altas, 0 cambios, 0 sin cambios"]));
});

test("exportar e importar con dos contactos del mismo nombre (uno desactivado) no da errores", async () => {
  const { admin, client, contact, quote } = await completeDraft();
  await prisma.quote.update({ where: { id: quote.id }, data: { contactId: contact.id } });
  await prisma.clientContact.update({ where: { id: contact.id }, data: { active: false, role: "Antigua" } });
  await saveContact(admin, client.id, { name: contact.name, role: "Nueva", email: "" });
  const before = await snapshot();
  const r = await importClients(admin, await writeClientsBook(await exportClients()), { apply: true });
  expect(r.rows.flatMap((x) => x.errors)).toEqual([]);
  expect(r.created).toBe(0);
  expect(await snapshot()).toEqual(before);
  expect((await prisma.clientContact.findUniqueOrThrow({ where: { id: contact.id } })).role).toBe("Antigua");
});

test("exportar e importar clientes sin cambios da todo sin cambios y no escribe", async () => {
  const admin = await makeUser("admin");
  const c = await createClient(admin, { legalName: "Aguas del Sur, S.A.", taxId: "B12345678", offerValidityDays: "30" });
  await saveContact(admin, c.id, { name: "Ana López", role: "Jefa", email: "ana@ejemplo.es" });
  await saveLocation(admin, c.id, { name: "Planta", installation: "EDAR Sur", country: "España" });
  const logs = await prisma.auditLog.count();
  const r = await importClients(admin, await writeClientsBook(await exportClients()), { apply: true });
  expect([r.created, r.updated, r.unchanged]).toEqual([0, 0, 3]);
  expect(await prisma.auditLog.count()).toBe(logs + 1);
  expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "import" } })).summary).toBe("Importación de clientes: 0 altas, 0 cambios, 3 sin cambios");
});

test("un cambio en la instalación dice qué cambia", async () => {
  const admin = await makeUser("admin");
  const c = await createClient(admin, { legalName: "Aguas del Sur, S.A.", taxId: "B12345678" });
  await saveLocation(admin, c.id, { name: "Planta", country: "España" });
  const r = await importClients(admin, await book({ Instalaciones: [{ CIF: "B12345678", Nombre: "Planta", Pais: "Portugal" }] }), { apply: false });
  expect(r.rows[0]).toMatchObject({ sheet: "Instalaciones", action: "update", changes: ["País: España → Portugal"] });
});
