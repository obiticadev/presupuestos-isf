import ExcelJS from "exceljs";
import { Prisma } from "@/generated/prisma/client";

export type SheetRow<C extends string> = { row: number; values: Record<C, string>; cellErrors: string[] };

/** Excel error values (#REF!, #DIV/0!…) and formulas without a cached result: never read as an empty cell. */
export function cellError(value: ExcelJS.CellValue): string | null {
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
export function cellText(value: ExcelJS.CellValue): string {
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

/** The workbook, or null when the bytes are not a valid .xlsx. */
export async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook | null> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return wb;
  } catch {
    return null;
  }
}

/** Rows of a sheet whose first row names the columns (in any order); empty rows are skipped. */
export function readSheetRows<C extends string>(ws: ExcelJS.Worksheet, columns: readonly C[], maxRows: number): { rows: SheetRow<C>[] } | { error: string } {
  const position = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => position.set(cellText(cell.value), col));
  const missing = columns.find((c) => !position.has(c));
  if (missing) return { error: `Falta la columna ${missing}` };

  const rows: SheetRow<C>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = columns.map((c) => [c, row.getCell(position.get(c)!).value] as const);
    const values = Object.fromEntries(cells.map(([c, v]) => [c, cellText(v)])) as Record<C, string>;
    const cellErrors = cells.flatMap(([c, v]) => { const err = cellError(v); return err ? [`${c}: la celda tiene un error (${err})`] : []; });
    if (cellErrors.length === 0 && Object.values(values).every((v) => v === "")) continue;
    rows.push({ row: r, values, cellErrors });
    if (rows.length > maxRows) return { error: `El archivo tiene más de ${maxRows.toLocaleString("es-ES")} filas` };
  }
  return { rows };
}
