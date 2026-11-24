import { Prisma } from "@/generated/prisma/client";
import { kitDefinition, type KitDefinition } from "@/modules/kits/definition";
import { expandKit, type ConceptForKit } from "@/modules/kits/formulas";
import { fromDefinition, legacyDescription, materialSummary, showsRequired, toDefinition, type FormMaterial, type RefInfo } from "@/modules/kits/form";

const concept = (id: string, categoryId: string): ConceptForKit => ({
  id, categoryId, description: id, unitName: "ud", salePrice: new Prisma.Decimal(10), taxName: "IVA 21 %", taxRatePct: new Prisma.Decimal(21), active: true,
});
const CONCEPTS = new Map([["bomba", concept("bomba", "cat-bombas")], ["manguera", concept("manguera", "cat-mangueras")], ["contador", concept("contador", "cat-medida")]]);
const info: RefInfo = (r) => (r.kind === "categoryId"
  ? { label: { "cat-bombas": "Bombas", "cat-mangueras": "Mangueras" }[r.id] ?? "?", unit: "", prefix: "X" }
  : { label: "Válvula", unit: "ud", prefix: "VAL" });
const mat = (over: Partial<FormMaterial>): FormMaterial => ({ slot: "c1", ref: { kind: "categoryId", id: "cat-mangueras" }, qty: "1", mult: true, ask: false, required: true, inName: true, ...over });
const main = { kind: "categoryId" as const, id: "cat-bombas" };

// Production kits on 2026-11-24 (spec 3).
const BOMBA: KitDefinition = {
  main: { categoryId: "cat-bombas", label: "Bomba" },
  params: [{ key: "distancia", label: "Distancia al cuadro", unit: "m", required: true }],
  components: [{ slot: "c1", label: "Manguera", ref: { categoryId: "cat-mangueras" }, required: true, formula: { type: "PER_QTY_AND_PARAM", param: "distancia", k: "1" } }],
};
const MEDIDA: KitDefinition = {
  main: { conceptId: "contador", label: "Equipo de medida" },
  params: [{ key: "distancia", label: "Distancia al cuadro eléctrico", unit: "m", required: true }],
  components: [{ slot: "c1", label: "Manguera", ref: { categoryId: "cat-mangueras" }, required: true, formula: { type: "PER_QTY", k: "1" } }],
};

test("tabla de la spec 5.2: ask y mult dan la fórmula", () => {
  const f = (m: Partial<FormMaterial>) => toDefinition(main, [mat(m)], info).components[0].formula;
  expect(f({ qty: "1,5", mult: true })).toEqual({ type: "PER_QTY", k: "1.5" });
  expect(f({ qty: "2", mult: false })).toEqual({ type: "FIXED", k: "2" });
  expect(f({ ask: true, mult: true })).toEqual({ type: "PER_QTY_AND_PARAM", param: "q_c1", k: "1" });
  expect(f({ ask: true, mult: false })).toEqual({ type: "PARAM", param: "q_c1", k: "1" });
});

test("cada material pedido tiene su dato «X: cantidad» y no quedan datos sin usar", () => {
  const d = toDefinition(main, [mat({ ask: true, required: false }), mat({ slot: "c2", ref: { kind: "conceptId", id: "v" }, ask: true })], info);
  expect(d.params).toEqual([
    { key: "q_c1", label: "Mangueras: cantidad", unit: "", required: false },
    { key: "q_c2", label: "Válvula: cantidad", unit: "ud", required: true },
  ]);
  expect(toDefinition(main, [mat({})], info).params).toEqual([]);
  expect(kitDefinition.safeParse(d).success).toBe(true);
});

test("etiquetas e inName salen del formulario", () => {
  const d = toDefinition(main, [mat({ inName: false })], info);
  expect(d.main).toEqual({ categoryId: "cat-bombas", label: "Bombas" });
  expect(d.components[0]).toMatchObject({ label: "Mangueras", ref: { categoryId: "cat-mangueras" }, inName: false });
});

test("un artículo fijo con cantidad fija es siempre obligatorio", () => {
  const fixed = mat({ ref: { kind: "conceptId", id: "v" }, required: false });
  expect(showsRequired(fixed)).toBe(false);
  expect(toDefinition(main, [fixed], info).components[0].required).toBe(true);
  expect(showsRequired(mat({ required: false }))).toBe(true);
  expect(toDefinition(main, [mat({ required: false })], info).components[0].required).toBe(false);
});

test("los conjuntos de producción se abren con el primer material en el nombre", () => {
  expect(fromDefinition(BOMBA)).toEqual({ main, materials: [{ slot: "c1", ref: { kind: "categoryId", id: "cat-mangueras" }, qty: "", mult: true, ask: true, required: true, inName: true }] });
  expect(fromDefinition(MEDIDA).materials[0]).toMatchObject({ qty: "1", mult: true, ask: false, inName: true });
  expect(fromDefinition(MEDIDA).main).toEqual({ kind: "conceptId", id: "contador" });
});

test("ida y vuelta de los conjuntos de producción da las mismas cantidades", () => {
  const lines = (d: KitDefinition, params: Record<string, string>, choices: Record<string, string>) =>
    expandKit(d, { quantity: "2", params, choices }, CONCEPTS).lines.map((l) => [l.slot, l.quantity.toFixed()]);
  const again = (d: KitDefinition) => { const f = fromDefinition(d); return toDefinition(f.main, f.materials, info); };
  expect(lines(again(BOMBA), { q_c1: "10" }, { main: "bomba", c1: "manguera" })).toEqual(lines(BOMBA, { distancia: "10" }, { main: "bomba", c1: "manguera" }));
  expect(lines(again(MEDIDA), {}, { c1: "manguera" })).toEqual(lines(MEDIDA, { distancia: "10" }, { c1: "manguera" }));
});

test("un inName guardado se respeta, aunque todos sean false; PARAM se abre como pedido y una vez", () => {
  const d: KitDefinition = { ...BOMBA, params: [{ key: "q_c1", label: "M", unit: "", required: true }],
    components: [{ ...BOMBA.components[0], inName: false, formula: { type: "PARAM", param: "q_c1", k: "1" } }] };
  expect(fromDefinition(d).materials[0]).toMatchObject({ inName: false, ask: true, mult: false });
});

test("resumen en palabras de cada material", () => {
  expect(materialSummary(mat({}), "ud")).toBe("1 ud × principal");
  expect(materialSummary(mat({ mult: false, qty: "1,5" }), "h")).toBe("1,5 h en total");
  expect(materialSummary(mat({ ask: true }), "")).toBe("cantidad al presupuestar × principal");
  expect(materialSummary(mat({ ask: true, mult: false }), "")).toBe("cantidad al presupuestar en total");
});

test("el nombre antiguo pasa delante de la descripción, salvo si ya es automático", () => {
  expect(legacyDescription("Instalación de bomba", "BOM-MAN", "Bomba con…")).toBe("Instalación de bomba. Bomba con…");
  expect(legacyDescription("Instalación de bomba", "BOM-MAN", "")).toBe("Instalación de bomba");
  expect(legacyDescription("BOM-MAN-2", "BOM-MAN", "x")).toBe("x");
});
