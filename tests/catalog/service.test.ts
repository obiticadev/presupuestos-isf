import { prisma } from "@/lib/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { setCategoryActive } from "@/modules/catalog/lists";
import {
  createConcept, getConcept, listConcepts, removeConcept, setConceptActive, suggestSalePrice, updateConcept,
} from "@/modules/catalog/service";
import { makeUser } from "../helpers/users";

const base = { categoryId: "cat-material", unitId: "unit-ud", taxId: "iva-21", description: "Relé", validated: false };

test("la semilla trae los seis conceptos sin validar", async () => {
  const { items } = await listConcepts({ status: "all" });
  expect(items.map((c) => c.code)).toEqual(["BOM-HASTA75", "BOM-MAYOR75", "MAN-12X075", "MAN-4X25", "SER-DESPL", "SER-PROG"]);
  expect(items.every((c) => !c.validated)).toBe(true);
  expect(items.find((c) => c.code === "SER-DESPL")?.salePrice?.toFixed(4)).toBe("0.3000");
});

test("el código se normaliza y no puede repetirse aunque cambie el formato", async () => {
  const admin = await makeUser("admin");
  const c = await createConcept(admin, { ...base, code: " rel-01 ", salePrice: "12,5" });
  expect(c.code).toBe("REL-01");
  expect(c.salePrice?.toFixed(4)).toBe("12.5000");
  await expect(createConcept(admin, { ...base, code: "REL-01" })).rejects.toThrow("Ya existe un concepto con ese código");
});

test("un código con caracteres raros se rechaza", async () => {
  const admin = await makeUser("admin");
  await expect(createConcept(admin, { ...base, code: "REL 01/A" })).rejects.toThrow(ValidationError);
});

test("un concepto sin precio de venta se puede guardar", async () => {
  const admin = await makeUser("admin");
  expect((await createConcept(admin, { ...base, code: "SIN-PRECIO" })).salePrice).toBeNull();
});

test("no se puede usar una categoría desactivada", async () => {
  const admin = await makeUser("admin");
  await setCategoryActive(admin, "cat-material", false);
  await expect(createConcept(admin, { ...base, code: "X1" })).rejects.toThrow(ValidationError);
});

test("un concepto conserva su categoría desactivada al editarlo", async () => {
  const admin = await makeUser("admin");
  await setCategoryActive(admin, "cat-mangueras", false);
  const c = await getConcept("concept-man-4x25");
  await expect(updateConcept(admin, c.id, { ...base, code: c.code, categoryId: c.categoryId, unitId: c.unitId, description: "Otra" })).resolves.toBeTruthy();
});

test("buscar y filtrar", async () => {
  expect((await listConcepts({ q: "mangu" })).items).toHaveLength(2);
  expect((await listConcepts({ categoryId: "cat-bombas" })).items).toHaveLength(2);
  expect((await listConcepts({ validated: "yes" })).items).toHaveLength(0);
});

test("los desactivados no salen por defecto", async () => {
  const admin = await makeUser("admin");
  await setConceptActive(admin, "concept-ser-prog", false);
  expect((await listConcepts({})).total).toBe(5);
  expect((await listConcepts({ status: "inactive" })).items.map((c) => c.code)).toEqual(["SER-PROG"]);
});

test("cambiar el precio deja el antes y el después en el historial", async () => {
  const admin = await makeUser("admin");
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...base, code: c.code, categoryId: c.categoryId, unitId: c.unitId, description: c.description, salePrice: "12" });
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "concept", entityId: c.id } });
  expect(log.summary).toContain("10,00 → 12,00");
});

test("eliminar un concepto sin uso lo borra", async () => {
  const admin = await makeUser("admin");
  expect(await removeConcept(admin, "concept-ser-prog")).toBe("deleted");
  await expect(getConcept("concept-ser-prog")).rejects.toThrow(NotFoundError);
  expect(await prisma.auditLog.count({ where: { entity: "concept", entityId: "concept-ser-prog", action: "delete" } })).toBe(1);
});

test("un presupuestador consulta pero no modifica", async () => {
  const p = await makeUser("presupuestador");
  expect((await listConcepts({})).total).toBe(6);
  await expect(createConcept(p, { ...base, code: "P1" })).rejects.toThrow(ForbiddenError);
  await expect(removeConcept(p, "concept-ser-prog")).rejects.toThrow(ForbiddenError);
});

test.each([["14,20", "35", "19,17"], ["3,10", "35", "4,19"], ["abc", "35", null]])(
  "suggestSalePrice(%s, %s) = %s",
  (cost, m, out) => expect(suggestSalePrice(cost, m)).toBe(out),
);
