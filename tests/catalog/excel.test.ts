import ExcelJS from "exceljs";
import { COLUMNS, writeCatalogSheet } from "@/modules/catalog/excel";
import { prisma } from "@/lib/db";
import { importConcepts } from "@/modules/catalog/import";
import { setUnitActive } from "@/modules/catalog/lists";
import { getConcept, listConcepts } from "@/modules/catalog/service";
import { makeUser } from "../helpers/users";
import { makeDraft } from "../helpers/quotes";
import { addCatalogLine } from "@/modules/quotes/service";
import { saveKit } from "@/modules/kits/service";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import * as usage from "@/modules/catalog/usage";

vi.mock("@/modules/catalog/usage", async (orig) => {
  const m = await orig<typeof import("@/modules/catalog/usage")>();
  return { ...m, usedConceptIds: vi.fn(m.usedConceptIds) };
});

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

test("exportar e importar sin cambios da 6 sin cambios y no toca el historial", async () => {
  const admin = await makeUser("admin");
  const { items } = await listConcepts({ status: "all" });
  const bytes = await writeCatalogSheet(await Promise.all(items.map((c) => getConcept(c.id))));
  const r = await importConcepts(admin, bytes, { apply: false });
  expect(r.error).toBeUndefined();
  expect(r.rows.every((x) => x.errors.length === 0)).toBe(true);
  expect([r.created, r.updated, r.unchanged]).toEqual([0, 0, 6]);
  const before = await prisma.auditLog.count();
  expect((await importConcepts(admin, bytes, { apply: true })).applied).toBe(true);
  expect(await prisma.auditLog.count()).toBe(before + 1); // only «Importación de catálogo»
});

/** Row for an existing concept as the export writes it, with some columns overridden. */
async function rowOf(code: string, o: Partial<Record<Col, unknown>>) {
  const { items } = await listConcepts({ status: "all" });
  const c = await getConcept(items.find((x) => x.code === code)!.id);
  const bytes = await writeCatalogSheet([c]);
  const ws = (await new ExcelJS.Workbook().xlsx.load(bytes as never)).getWorksheet("Catalogo")!;
  return COLUMNS.map((col, i) => o[col] ?? ws.getRow(2).getCell(i + 1).value);
}

test("un cambio dice qué campo cambia", async () => {
  const admin = await makeUser("admin");
  const r = await importConcepts(admin, await book([await rowOf("SER-PROG", { Precio_venta: "1.234,5" })]), { apply: false });
  expect(r.rows[0]).toMatchObject({ action: "update", changes: [expect.stringMatching(/^Precio de venta: .* → 1\.234,50$/)] });
});

test("decimales con otra forma salen sin cambios", async () => {
  const admin = await makeUser("admin");
  const r = await importConcepts(admin, await book([await rowOf("SER-DESPL", { Precio_venta: "0,3000" })]), { apply: false });
  expect(r.rows[0].action).toBe("unchanged");
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

/** Only SER-PROG, as exported: in full mode the other 5 seed concepts are absent. */
const onlyProg = async () => book([await rowOf("SER-PROG", {})]);

test("la completa borra lo no usado y desactiva lo usado", async () => {
  const admin = await makeUser("admin");
  const { actor, sub } = await makeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "1" });
  const bytes = await onlyProg();
  const r = await importConcepts(admin, bytes, { apply: false, mode: "full" });
  expect(r.removals.filter((x) => x.outcome === "deactivate").map((x) => x.label)).toEqual(["MAN-4X25", "SER-DESPL"]);
  expect(r.removals.filter((x) => x.outcome === "delete").map((x) => x.label)).toEqual(["BOM-HASTA75", "BOM-MAYOR75", "MAN-12X075"]);
  expect(await prisma.concept.count()).toBe(6); // the review writes nothing

  const a = await importConcepts(admin, bytes, { apply: true, mode: "full" });
  expect(a.applied).toBe(true);
  expect((await prisma.concept.findMany({ orderBy: { code: "asc" } })).map((c) => [c.code, c.active])).toEqual([["MAN-4X25", false], ["SER-DESPL", false], ["SER-PROG", true]]);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: "concept-man-4x25", action: "deactivate" } });
  expect(log).toMatchObject({ summary: "MAN-4X25 desactivado (importación completa)", data: { source: "import-full", concept: { code: "MAN-4X25", active: false } } });
  expect(await prisma.auditLog.findFirst({ where: { entityId: "concept-bom-hasta75", action: "delete" } })).toMatchObject({ summary: "Baja de BOM-HASTA75 (importación completa)", data: { source: "import-full" } });
  expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "import" }, orderBy: { createdAt: "desc" } })).summary)
    .toBe("Importación de catálogo: 0 altas, 0 cambios, 1 sin cambios, 3 bajas, 2 desactivados");

  // Again: the already inactive and used ones neither count nor are touched.
  expect((await importConcepts(admin, bytes, { apply: false, mode: "full" })).removals).toEqual([]);
});

test("un presupuestador no puede hacer la completa", async () => {
  const p = await makeUser("presupuestador");
  await expect(importConcepts(p, await onlyProg(), { apply: false, mode: "full" })).rejects.toThrow(ForbiddenError);
});

test("la completa con una hoja sin filas da error", async () => {
  const admin = await makeUser("admin");
  const r = await importConcepts(admin, await book([]), { apply: true, mode: "full" });
  expect(r.error).toBe("El archivo no tiene filas: la importación completa lo borraría todo");
  expect(await prisma.concept.count()).toBe(6);
});

test("lo que pasa a estar usado entre revisar y confirmar se desactiva", async () => {
  const admin = await makeUser("admin");
  const bytes = await onlyProg();
  const r = await importConcepts(admin, bytes, { apply: false, mode: "full" });
  expect(r.removals.find((x) => x.label === "MAN-4X25")?.outcome).toBe("delete");
  const { actor, sub } = await makeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "1" });
  expect((await importConcepts(admin, bytes, { apply: true, mode: "full" })).applied).toBe(true);
  expect(await prisma.concept.findUnique({ where: { id: "concept-man-4x25" } })).toMatchObject({ active: false });
});

test("la revisión avisa de los conjuntos que quedarán incompletos", async () => {
  const admin = await makeUser("admin");
  await saveKit(admin, { name: "Bomba", description: "", definition: { main: { conceptId: "concept-bom-hasta75", label: "Bomba" }, params: [], components: [] } });
  const r = await importConcepts(admin, await onlyProg(), { apply: false, mode: "full" });
  expect(r.incompleteKits).toEqual([{ name: "Bomba", codes: ["BOM-HASTA75"] }]);
});

test("si un borrado choca con una referencia, error y no se guarda nada", async () => {
  const admin = await makeUser("admin");
  vi.mocked(usage.usedConceptIds).mockResolvedValueOnce(new Set()); // SER-DESPL looks unused, but is required (FK)
  const bytes = await book([await rowOf("SER-PROG", { Precio_venta: 99 })]);
  const err = await importConcepts(admin, bytes, { apply: true, mode: "full" }).catch((e) => e);
  expect(err).toBeInstanceOf(ValidationError);
  expect(err.issues).toEqual({ _: "Algo ha cambiado mientras revisabas: vuelve a revisar el archivo" });
  expect(await prisma.concept.count()).toBe(6);
  expect((await getConcept("concept-ser-prog")).salePrice?.toFixed(2)).not.toBe("99.00");
});

test("la importación completa conserva las variantes de los conjuntos dinámicos ausentes del Excel", async () => {
  const admin = await makeUser("admin");
  await saveKit(admin, { name: "Tarjetas", description: "", definition: {
    kind: "dynamic", params: [], components: [],
    slotTypes: [{ key: "t1", label: "Entradas", abbr: "ED", red: false, variants: { conceptIds: ["concept-man-12x075"] } }],
  } });
  const bytes = await onlyProg();
  const review = await importConcepts(admin, bytes, { apply: false, mode: "full" });
  expect(review.removals.find((r) => r.id === "concept-man-12x075")?.outcome).toBe("deactivate");
  expect(review.incompleteKits).toEqual([{ name: "Tarjetas", codes: ["MAN-12X075"] }]);
  expect((await importConcepts(admin, bytes, { apply: true, mode: "full" })).applied).toBe(true);
  expect(await prisma.concept.findUnique({ where: { id: "concept-man-12x075" } })).toMatchObject({ active: false });
});
