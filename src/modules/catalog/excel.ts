import ExcelJS from "exceljs";
import { Prisma } from "@/generated/prisma/client";
import type { ConceptDetail } from "./service";

/** Import and export share this flat format; the downloadable template is the same book with no rows. */
export const COLUMNS = [
  "Codigo", "Categoria", "Descripcion", "Unidad", "Precio_venta", "Coste", "Impuesto", "Activo", "Validado",
  "Observaciones", "Fabricante", "Referencia_proveedor", "Proveedor", "PVP", "Descuento_pct",
] as const;
export type Column = (typeof COLUMNS)[number];
export type RawRow = { row: number; values: Record<Column, string>; cellErrors: string[] };

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HELP: [Column, string][] = [
  ["Codigo", "Obligatorio y único. Letras, números, punto y guiones. Si ya existe, la fila actualiza ese concepto."],
  ["Categoria", "Nombre de una categoría activa (Configuración)."],
  ["Descripcion", "Obligatoria."],
  ["Unidad", "Nombre de una unidad activa: km, h, m, ud…"],
  ["Precio_venta", "Número. Vacío = sin precio (no se podrá usar en presupuestos)."],
  ["Coste", "Número, opcional."],
  ["Impuesto", "Nombre de un impuesto activo, por ejemplo IVA 21 %."],
  ["Activo", "SI o NO. Vacío = SI."],
  ["Validado", "SI o NO. Vacío = NO. Un concepto sin validar bloquea la emisión."],
  ["Observaciones", "Texto libre."],
  ["Fabricante", "Opcional."],
  ["Referencia_proveedor", "Opcional."],
  ["Proveedor", "Opcional."],
  ["PVP", "Número, opcional."],
  ["Descuento_pct", "Número de 0 a 100, opcional."],
];

const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v.toString()));
const yesNo = (b: boolean) => (b ? "SI" : "NO");

export async function writeCatalogSheet(rows: ConceptDetail[]): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Catalogo", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...COLUMNS]).font = { bold: true };
  for (const c of rows) {
    ws.addRow([
      c.code, c.category.name, c.description, c.unit.name, num(c.salePrice), num(c.cost), c.tax.name,
      yesNo(c.active), yesNo(c.validated), c.notes, c.manufacturer, c.supplierRef, c.supplier, num(c.listPrice), num(c.discountPct),
    ]);
  }
  ws.columns.forEach((col, i) => { col.width = [16, 14, 44, 8, 13, 11, 12, 8, 9, 40, 16, 20, 18, 11, 13][i]; });
  const help = wb.addWorksheet("Instrucciones");
  help.addRow(["Columna", "Qué admite"]).font = { bold: true };
  HELP.forEach((h) => help.addRow(h));
  help.addRow([]);
  help.addRow(["Números", "Como número de Excel o como texto español (1.234,56). Se guardan con un máximo de 4 decimales."]);
  help.addRow(["Todo o nada", "Si alguna fila tiene errores, no se importa ninguna."]);
  help.getColumn(1).width = 22;
  help.getColumn(2).width = 90;
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Excel error values (#REF!, #DIV/0!…) and formulas without a cached result: never read as an empty cell. */
function cellError(value: ExcelJS.CellValue): string | null {
  if (value === null || typeof value !== "object" || value instanceof Date) return null;
  if ("error" in value) return String(value.error);
  if ("formula" in value || "sharedFormula" in value) {
    const result = (value as { result?: unknown }).result;
    if (result === undefined) return "fórmula sin resultado";
    if (result && typeof result === "object" && "error" in result) return String((result as { error: unknown }).error);
  }
  return null;
}

/** Cell value as text; numbers go through Decimal (4 places) so float artefacts never reach the database. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  // Comma decimal, so "0.305" is not read as the ambiguous thousands form "1.500" by parseDecimalEs.
  if (typeof value === "number") return new Prisma.Decimal(value).toDecimalPlaces(4).toFixed().replace(".", ",");
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "SI" : "NO";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ("richText" in value) return value.richText.map((t) => t.text).join("").trim();
  if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
  if ("text" in value) return String(value.text).trim();
  return "";
}

export async function readCatalogSheet(bytes: Uint8Array): Promise<{ rows: RawRow[] } | { error: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    return { error: "El archivo no es un Excel (.xlsx) válido" };
  }
  const ws = wb.getWorksheet("Catalogo") ?? wb.worksheets[0];
  if (!ws) return { error: "El archivo no es un Excel (.xlsx) válido" };

  const position = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => position.set(cellText(cell.value), col));
  const missing = COLUMNS.find((c) => !position.has(c));
  if (missing) return { error: `Falta la columna ${missing}` };

  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = COLUMNS.map((c) => [c, row.getCell(position.get(c)!).value] as const);
    const values = Object.fromEntries(cells.map(([c, v]) => [c, cellText(v)])) as Record<Column, string>;
    const cellErrors = cells.flatMap(([c, v]) => { const err = cellError(v); return err ? [`${c}: la celda tiene un error (${err})`] : []; });
    if (cellErrors.length === 0 && Object.values(values).every((v) => v === "")) continue;
    rows.push({ row: r, values, cellErrors });
    if (rows.length > MAX_IMPORT_ROWS) return { error: `El archivo tiene más de ${MAX_IMPORT_ROWS.toLocaleString("es-ES")} filas` };
  }
  return { rows };
}
