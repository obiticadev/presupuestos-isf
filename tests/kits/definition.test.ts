import { expect, test } from "vitest";
import { isDynamic, kitDefinition, partKey, slotLineKey } from "@/modules/kits/definition";

const BOMBA = {
  main: { categoryId: "cat-bombas", label: "Bomba" },
  params: [{ key: "distancia", label: "Distancia al cuadro", unit: "m", required: true }],
  components: [{ slot: "c1", label: "Manguera", ref: { categoryId: "cat-mangueras" }, required: true, formula: { type: "PER_QTY_AND_PARAM", param: "distancia", k: "1" } }],
};
const ED = { key: "t1", label: "Entradas digitales", abbr: "ED", red: false, variants: { categoryId: "cat-di" } };
const messages = (raw: unknown) => kitDefinition.safeParse(raw).error?.issues.map((i) => i.message) ?? [];

test("una definición antigua sigue validando y sale como normal sin slots ni dinámicos", () => {
  const d = kitDefinition.parse(BOMBA);
  expect(d).toEqual(BOMBA);
  expect(isDynamic(d)).toBe(false);
  expect(d.slotTypes ?? []).toEqual([]);
  expect(d.dynamics ?? []).toEqual([]);
});

test("un conjunto normal exige principal", () => {
  const issues = kitDefinition.safeParse({ ...BOMBA, main: undefined }).error?.issues ?? [];
  expect(issues).toContainEqual(expect.objectContaining({ path: ["main"], message: "Elige el principal" }));
});

test("un dinámico puede no tener principal pero necesita al menos un tipo de slot", () => {
  expect(messages({ kind: "dynamic", params: [], components: [], slotTypes: [] })).toContain("Añade al menos un tipo de slot");
  expect(kitDefinition.safeParse({ kind: "dynamic", params: [], components: [], slotTypes: [ED] }).success).toBe(true);
});

test("un dinámico no lleva datos ni otros dinámicos", () => {
  expect(messages({ kind: "dynamic", params: BOMBA.params, components: [], slotTypes: [ED] })).toContain("Un conjunto dinámico no pide datos");
  const dyn = { slot: "d1", label: "Periferia", choice: { templateId: "x" }, optional: false };
  expect(messages({ kind: "dynamic", params: [], components: [], slotTypes: [ED], dynamics: [dyn] })).toContain("Un conjunto dinámico no puede llevar otro");
});

test("un conjunto normal no lleva tipos de slot", () => {
  expect(messages({ ...BOMBA, slotTypes: [ED] })).toContain("Solo los conjuntos dinámicos tienen slots");
});

test("claves de tipo y de dinámico repetidas", () => {
  expect(messages({ kind: "dynamic", params: [], components: [], slotTypes: [ED, ED] })).toContain("Tipo repetido");
  const dyn = { slot: "d1", label: "Periferia", choice: { templateId: "x" }, optional: false };
  expect(messages({ ...BOMBA, dynamics: [dyn, dyn] })).toContain("Hueco repetido");
});

test("elegir entre dinámicos pide al menos dos", () => {
  const dyn = { slot: "d1", label: "Periferia", choice: { templateIds: ["a"] }, optional: false };
  expect(messages({ ...BOMBA, dynamics: [dyn] })).toContain("Elige al menos dos");
});

test("slotLineKey y partKey", () => {
  expect(slotLineKey("self", "x1")).toBe("s:x1");
  expect(slotLineKey("d1", "x1")).toBe("d1/s:x1");
  expect(partKey("d1", "c2")).toBe("d1/c2");
});
