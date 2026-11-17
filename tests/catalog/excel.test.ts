import ExcelJS from "exceljs";
import { COLUMNS, writeCatalogSheet } from "@/modules/catalog/excel";
import { importConcepts } from "@/modules/catalog/import";
import { setUnitActive } from "@/modules/catalog/lists";
import { getConcept, listConcepts } from "@/modules/catalog/service";
import { makeUser } from "../helpers/users";

type Col = (typeof COLUMNS)[number];
const DEFAULTS: Partial<Record<Col, unknown>> = {
  Categoria: "Material", Unidad: "ud", Impuesto: "IVA 21 %", Activo: "SI", Validado: "NO", Descripcion: "Algo",
};

/** Builds an .xlsx in memory with a "Catalogo" sheet. */
async function book(rows: unknown[][], header: readonly string[] = COLUMNS): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Catalogo");
  ws.addRow([...header]);
  rows.forEach((r) => ws.addRow(r));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
const row = (o: Partial<Record<Col, unknown>>) => COLUMNS.map((c) => o[c] ?? DEFAULTS[c] ?? null);

test("exportar e importar sin cambios da 0 altas y 6 cambios sin errores", async () => {
  const admin = await makeUser("admin");
  const { items } = await listConcepts({ status: "all" });
  const bytes = await writeCatalogSheet(await Promise.all(items.map((c) => getConcept(c.id))));
  const r = await importConcepts(admin, bytes, { apply: false });
  expect(r.error).toBeUndefined();
  expect(r.rows.every((x) => x.errors.length === 0)).toBe(true);
  expect([r.created, r.updated]).toEqual([0, 6]);
});

test("números con artefactos de coma flotante y texto español se guardan exactos", async () => {
  const admin = await makeUser("admin");
  const bytes = await book([row({ Codigo: "F1", Precio_venta: 15.845220000000001 }), row({ Codigo: "F2", Precio_venta: "1.234,56" })]);
  expect((await importConcepts(admin, bytes, { apply: true })).applied).toBe(true);
  const { items } = await listConcepts({ status: "all" });
  expect(items.find((c) => c.code === "F1")?.salePrice?.toFixed(4)).toBe("15.8452");
  expect(items.find((c) => c.code === "F2")?.salePrice?.toFixed(4)).toBe("1234.5600");
});

test("una fila mala impide toda la importación", async () => {
  const admin = await makeUser("admin");
  const bytes = await book([row({ Codigo: "OK-1", Precio_venta: 5 }), row({ Codigo: "MAL-1", Precio_venta: "cinco" })]);
  const r = await importConcepts(admin, bytes, { apply: true });
  expect(r.applied).toBe(false);
  expect(r.rows[1].row).toBe(3);
  expect(r.rows[1].errors[0]).toMatch(/número/);
  expect((await listConcepts({ q: "OK-1", status: "all" })).total).toBe(0);
});

test("código existente actualiza, aunque venga en minúsculas; repetido en el archivo es error", async () => {
  const admin = await makeUser("admin");
  const r = await importConcepts(admin, await book([row({ Codigo: "man-4x25 ", Categoria: "Mangueras", Unidad: "m", Precio_venta: 11 })]), { apply: true });
  expect(r.rows[0].action).toBe("update");
  expect((await getConcept("concept-man-4x25")).salePrice?.toFixed(2)).toBe("11.00");
  const dup = await importConcepts(admin, await book([row({ Codigo: "D1" }), row({ Codigo: "d1" })]), { apply: false });
  expect(dup.rows[1].errors).toContain("Código repetido en la fila 2");
});

test("categoría inexistente o unidad desactivada es error de fila", async () => {
  const admin = await makeUser("admin");
  await setUnitActive(admin, "unit-km", false);
  const r = await importConcepts(admin, await book([row({ Codigo: "C1", Categoria: "Inventada" }), row({ Codigo: "C2", Unidad: "km" })]), { apply: false });
  expect(r.rows[0].errors[0]).toContain("Inventada");
  expect(r.rows[1].errors[0]).toContain("km");
});

test("archivo no Excel o sin una columna: error claro y nada cambia", async () => {
  const admin = await makeUser("admin");
  expect((await importConcepts(admin, new TextEncoder().encode("hola"), { apply: true })).error).toBe("El archivo no es un Excel (.xlsx) válido");
  const sinPrecio = await book([], COLUMNS.filter((c) => c !== "Precio_venta"));
  expect((await importConcepts(admin, sinPrecio, { apply: true })).error).toBe("Falta la columna Precio_venta");
});

test("SI/NO y vacíos se interpretan; un valor raro en Activo es error", async () => {
  const admin = await makeUser("admin");
  const r = await importConcepts(admin, await book([row({ Codigo: "B1", Validado: "si" }), row({ Codigo: "B2", Activo: "quizá" })]), { apply: false });
  expect(r.rows[0].errors).toEqual([]);
  expect(r.rows[1].errors[0]).toContain("Activo");
});

test("un presupuestador puede importar en modo añadir y actualizar", async () => {
  const p = await makeUser("presupuestador");
  const r = await importConcepts(p, await book([row({ Codigo: "PRE-1" })]), { apply: true });
  expect(r.applied).toBe(true);
});

test("«1.500» escrito como texto es un error de fila, no 1,50", async () => {
  const admin = await makeUser("admin");
  const r = await importConcepts(admin, await book([row({ Codigo: "AMB-1", Precio_venta: "1.500" })]), { apply: false });
  expect(r.rows[0].errors[0]).toContain("ambiguo");
});

test("celdas numéricas con tres decimales o artefactos de suma se importan bien", async () => {
  const admin = await makeUser("admin");
  const r = await importConcepts(admin, await book([row({ Codigo: "N1", Precio_venta: 0.305 }), row({ Codigo: "N2", Precio_venta: 0.1 + 0.2 }), row({ Codigo: "N3", Precio_venta: 1500 })]), { apply: true });
  expect(r.applied).toBe(true);
  const { items } = await listConcepts({ status: "all" });
  expect(["N1", "N2", "N3"].map((c) => items.find((x) => x.code === c)?.salePrice?.toFixed(4))).toEqual(["0.3050", "0.3000", "1500.0000"]);
});

test("una fórmula con error es un error de fila y no vacía el precio", async () => {
  const admin = await makeUser("admin");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Catalogo");
  ws.addRow([...COLUMNS]);
  ws.addRow(row({ Codigo: "MAN-4X25", Categoria: "Mangueras", Unidad: "m" }));
  ws.getCell("E2").value = { formula: "F2*1.35", result: { error: "#REF!" } } as ExcelJS.CellValue;
  const r = await importConcepts(admin, new Uint8Array(await wb.xlsx.writeBuffer()), { apply: true });
  expect(r.applied).toBe(false);
  expect(r.rows[0].errors.join(" ")).toContain("Precio_venta");
  expect((await getConcept("concept-man-4x25")).salePrice?.toFixed(2)).toBe("10.00");
});
