import ExcelJS from "exceljs";
import { loadWorkbook, readSheetRows, type SheetRow } from "@/lib/excel";
import { MAX_IMPORT_ROWS } from "@/modules/catalog/excel";
import type { ClientDetail } from "./service";

/** Spec 2.2: one sheet per list; the CIF is the key and joins contacts and installations to their client. */
export const CLIENT_COLUMNS = [
  "CIF", "Razon_social", "Nombre_comercial", "Direccion_fiscal", "Forma_pago", "Exclusiones", "Validez_dias", "Observaciones", "Activo",
] as const;
export const CONTACT_COLUMNS = ["CIF", "Nombre", "Cargo", "Email", "Telefono", "Activo"] as const;
export const LOCATION_COLUMNS = ["CIF", "Nombre", "Direccion", "Instalacion", "Pais", "Activo"] as const;

export type ClientColumn = (typeof CLIENT_COLUMNS)[number];
export type ContactColumn = (typeof CONTACT_COLUMNS)[number];
export type LocationColumn = (typeof LOCATION_COLUMNS)[number];
export type ClientsBook = { clients: SheetRow<ClientColumn>[]; contacts: SheetRow<ContactColumn>[]; locations: SheetRow<LocationColumn>[] };

// The CIF list and the client-name lookup reach this row; the import itself has no such limit.
const LAST_ROW = MAX_IMPORT_ROWS + 1;
const CIF_LIST = `Clientes!$A$2:$A$${LAST_ROW}`;

const HELP: [string, string][] = [
  ["Clientes", "Una fila por cliente. El CIF es la clave: si ya existe, la fila actualiza ese cliente."],
  ["CIF", "Obligatorio. Se ignoran espacios, puntos y guiones (A-28 000.000 = A28000000)."],
  ["Razon_social", "Obligatoria."],
  ["Forma_pago, Exclusiones", "Texto libre; se proponen al crear un presupuesto."],
  ["Validez_dias", "Entero de 1 a 365. Vacío = el valor por defecto de Configuración."],
  ["Activo", "SI o NO. Vacío = SI."],
  ["Contactos", "CIF del cliente (elígelo de la lista), nombre, cargo, email, teléfono y activo."],
  ["Instalaciones", "CIF del cliente (elígelo de la lista), nombre, dirección, instalación, país y activo."],
  ["Razon_social (Contactos, Instalaciones)", "Solo informativa: muestra el cliente del CIF elegido. No se importa."],
  ["CIF + nombre", "Un contacto o una instalación que ya existe en ese cliente con el mismo nombre se actualiza; si no, se añade."],
  ["Lo que falta", "Lo que no está en el Excel no se toca."],
  ["Todo o nada", "Si alguna fila tiene errores, no se importa ninguna."],
];

const yesNo = (b: boolean) => (b ? "SI" : "NO");

/** Adds the sheet of a child list: its columns, a read-only client name per row and the CIF picked from the Clientes sheet. */
function childSheet(wb: ExcelJS.Workbook, name: string, columns: readonly string[], rows: { cif: string; legalName: string; values: ExcelJS.CellValue[] }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...columns, "Razon_social"]).font = { bold: true };
  const nameCol = columns.length + 1;
  for (let r = 2; r <= Math.max(rows.length + 1, 501); r++) {
    const row = rows[r - 2];
    if (row) ws.getRow(r).values = [row.cif, ...row.values];
    ws.getRow(r).getCell(nameCol).value = { formula: `IFERROR(VLOOKUP(A${r},Clientes!$A:$B,2,FALSE),"")`, result: row?.legalName ?? "" };
  }
  ws.getColumn(nameCol).font = { italic: true, color: { argb: "FF6B6B6B" } };
  // shortcut: exceljs 4.4 writes range validations but its typings lack `dataValidations`; drop the cast if they add it.
  (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations.add(`A2:A${LAST_ROW}`, {
    type: "list", allowBlank: true, formulae: [CIF_LIST], showErrorMessage: true, errorStyle: "warning",
    errorTitle: "CIF", error: "Ese CIF no está en la hoja Clientes. Se aceptará si el cliente ya existe en la aplicación.",
  });
  ws.columns.forEach((col) => { col.width = 22; });
}

/** Clients with their contacts and installations; with no rows it is the downloadable template. */
export async function writeClientsBook(rows: ClientDetail[]): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet("Clientes", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...CLIENT_COLUMNS]).font = { bold: true };
  for (const c of rows) {
    ws.addRow([c.taxId, c.legalName, c.tradeName, c.fiscalAddress, c.paymentTerms, c.exclusions, c.offerValidityDays, c.notes, yesNo(c.active)]);
  }
  ws.columns.forEach((col, i) => { col.width = [14, 34, 24, 34, 30, 30, 12, 30, 8][i]; });
  childSheet(wb, "Contactos", CONTACT_COLUMNS, rows.flatMap((c) => c.contacts.map((x) => ({
    cif: c.taxId, legalName: c.legalName, values: [x.name, x.role, x.email, x.phone, yesNo(x.active)],
  }))));
  childSheet(wb, "Instalaciones", LOCATION_COLUMNS, rows.flatMap((c) => c.locations.map((x) => ({
    cif: c.taxId, legalName: c.legalName, values: [x.name, x.address, x.installation, x.country, yesNo(x.active)],
  }))));
  const help = wb.addWorksheet("Instrucciones");
  help.addRow(["Hoja o columna", "Qué admite"]).font = { bold: true };
  HELP.forEach((h) => help.addRow(h));
  help.getColumn(1).width = 34;
  help.getColumn(2).width = 100;
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export async function readClientsBook(bytes: Uint8Array): Promise<ClientsBook | { error: string }> {
  const wb = await loadWorkbook(bytes);
  if (!wb) return { error: "El archivo no es un Excel (.xlsx) válido" };
  const read = <C extends string>(name: string, columns: readonly C[]) => {
    const ws = wb.getWorksheet(name);
    if (!ws) return { error: `Falta la hoja ${name}` };
    const r = readSheetRows(ws, columns, MAX_IMPORT_ROWS);
    return "error" in r && r.error.startsWith("Falta la columna") ? { error: `${r.error} en la hoja ${name}` } : r;
  };
  const clients = read("Clientes", CLIENT_COLUMNS);
  if ("error" in clients) return clients;
  const contacts = read("Contactos", CONTACT_COLUMNS);
  if ("error" in contacts) return contacts;
  const locations = read("Instalaciones", LOCATION_COLUMNS);
  if ("error" in locations) return locations;
  if (clients.rows.length + contacts.rows.length + locations.rows.length > MAX_IMPORT_ROWS) {
    return { error: `El archivo tiene más de ${MAX_IMPORT_ROWS.toLocaleString("es-ES")} filas` };
  }
  return { clients: clients.rows, contacts: contacts.rows, locations: locations.rows };
}
