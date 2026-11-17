import { prisma } from "@/lib/db";
import { describeChanges, diffSnapshots, getConceptHistory, type ConceptSnapshot } from "@/modules/catalog/history";
import { createConcept, setConceptActive, updateConcept } from "@/modules/catalog/service";
import { makeUser } from "../helpers/users";

const base = { categoryId: "cat-material", unitId: "unit-ud", taxId: "iva-21", description: "Relé", validated: false };
const snap = (over: Partial<ConceptSnapshot> = {}): ConceptSnapshot => ({
  code: "H1", description: "Relé", category: "Material", unit: "ud", tax: "IVA 21%", salePrice: "10", cost: null,
  listPrice: null, discountPct: null, validated: false, active: true, notes: "", manufacturer: "", supplier: "", supplierRef: "", ...over,
});

test("diffSnapshots da los campos que cambian con sus valores", () => {
  const a = snap({ salePrice: "12", validated: true }), b = snap({ salePrice: "10", validated: false });
  expect(describeChanges(diffSnapshots(a, b))).toBe("Precio de venta: 10,00 → 12,00; Validado: no → sí");
});

test("cada escritura guarda la foto y guardar sin cambios no crea versión", async () => {
  const p = await makeUser("presupuestador");
  const c = await createConcept(p, { ...base, code: "H1", salePrice: "10" });
  await updateConcept(p, c.id, { ...base, code: "H1", salePrice: "12" });
  await updateConcept(p, c.id, { ...base, code: "H1", salePrice: "12,00" }); // igual: no cuenta
  await setConceptActive(p, c.id, false);
  const h = await getConceptHistory(c.id);
  expect(h.map((v) => v.snapshot?.salePrice)).toEqual(["12", "12", "10"]);
  expect(h.map((v) => v.snapshot?.active)).toEqual([false, true, true]);
  expect(h[1].summary).toBe("H1: Precio de venta: 10,00 → 12,00");
});

test("una entrada antigua sin foto se lee con su frase", async () => {
  await prisma.auditLog.create({ data: { entity: "concept", entityId: "concept-ser-prog", action: "update", summary: "SER-PROG: precio 1 → 2" } });
  const [v] = await getConceptHistory("concept-ser-prog");
  expect(v.snapshot).toBeNull();
  expect(v.summary).toBe("SER-PROG: precio 1 → 2");
});
