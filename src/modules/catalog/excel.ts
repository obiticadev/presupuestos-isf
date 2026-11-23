import ExcelJS from "exceljs";
import { Prisma } from "@/generated/prisma/client";
import { loadWorkbook, readSheetRows } from "@/lib/excel";
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

export async function readCatalogSheet(bytes: Uint8Array): Promise<{ rows: RawRow[] } | { error: string }> {
  const wb = await loadWorkbook(bytes);
  const ws = wb && (wb.getWorksheet("Catalogo") ?? wb.worksheets[0]);
  if (!ws) return { error: "El archivo no es un Excel (.xlsx) válido" };
  return readSheetRows(ws, COLUMNS, MAX_IMPORT_ROWS);
}
