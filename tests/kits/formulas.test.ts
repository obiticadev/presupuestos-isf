import { Prisma } from "@/generated/prisma/client";
import type { KitDefinition } from "@/modules/kits/definition";
import { kitDefinition as kitDefinitionSchema } from "@/modules/kits/definition";
import { expandKit, slotTypeOf, type ConceptForKit } from "@/modules/kits/formulas";
import { calculateQuote } from "@/modules/quotes/calculation";

const concept = (id: string, categoryId: string, price: string | null, active = true): ConceptForKit => ({
  id, categoryId, description: id, unitName: "ud", salePrice: price === null ? null : new Prisma.Decimal(price),
  taxName: "IVA 21 %", taxRatePct: new Prisma.Decimal(21), active,
});
const CONCEPTS = new Map([
  ["bomba", concept("bomba", "cat-bombas", "102")],
  ["manguera", concept("manguera", "cat-mangueras", "10")],
  ["vieja", concept("vieja", "cat-mangueras", "10", false)],
  ["sinprecio", concept("sinprecio", "cat-mangueras", null)],
  ["cuadro", concept("cuadro", "cat-material", "500")],
]);

const BOMBA_DEF: KitDefinition = {
  main: { categoryId: "cat-bombas", label: "Bomba" },
  params: [{ key: "distancia", label: "Distancia al cuadro", unit: "m", required: true }],
  components: [{ slot: "c1", label: "Manguera", ref: { categoryId: "cat-mangueras" }, required: true, formula: { type: "PER_QTY_AND_PARAM", param: "distancia", k: "1" } }],
};

test("ejemplo de la spec: 2 bombas a 10 m del cuadro → 2 ud y 20 m; valorado con calculateQuote da 404,00", () => {
  const x = expandKit(BOMBA_DEF, { quantity: "2", params: { distancia: "10" }, choices: { main: "bomba", c1: "manguera" } }, CONCEPTS);
  expect(x.missing).toEqual([]);
  expect(x.lines.map((l) => [l.slot, l.quantity.toFixed(0)])).toEqual([["main", "2"], ["c1", "20"]]);
  const t = calculateQuote([{ id: "s", subsections: [{ id: "ss", mode: "SUM", lines: x.lines.map((l) => (
    { id: l.slot, quantity: l.quantity, unitPrice: CONCEPTS.get(l.conceptId)!.salePrice, taxName: "IVA 21 %", taxRatePct: "21" })) }] }]);
  expect(t.base.toFixed(2)).toBe("404.00");
});

test("sin manguera o sin distancia el conjunto queda incompleto y sin líneas", () => {
  const x = expandKit(BOMBA_DEF, { quantity: "1", params: {}, choices: { main: "bomba" } }, CONCEPTS);
  expect(x.lines).toEqual([]);
  expect(x.missing).toEqual(["Falta el dato Distancia al cuadro", "Falta elegir Manguera"]);
});

test("FIXED no depende de N; PER_QTY sí; un principal fijo no necesita elección", () => {
  const def: KitDefinition = {
    main: { conceptId: "cuadro", label: "Cuadro" }, params: [],
    components: [
      { slot: "c1", label: "Fija", ref: { conceptId: "manguera" }, required: true, formula: { type: "FIXED", k: "3" } },
      { slot: "c2", label: "Por N", ref: { conceptId: "bomba" }, required: true, formula: { type: "PER_QTY", k: "2" } },
    ],
  };
  const x = expandKit(def, { quantity: "5", params: {}, choices: {} }, CONCEPTS);
  expect(x.lines.map((l) => [l.conceptId, l.quantity.toFixed(0)])).toEqual([["cuadro", "5"], ["manguera", "3"], ["bomba", "10"]]);
});

test("un componente opcional sin elegir se omite sin error", () => {
  const def = { ...BOMBA_DEF, components: [{ ...BOMBA_DEF.components[0], required: false }] };
  const x = expandKit(def, { quantity: "1", params: { distancia: "5" }, choices: { main: "bomba" } }, CONCEPTS);
  expect(x.missing).toEqual([]);
  expect(x.lines.map((l) => l.slot)).toEqual(["main"]);
});

test("un concepto de otra categoría en el hueco es un error", () => {
  const x = expandKit(BOMBA_DEF, { quantity: "1", params: { distancia: "5" }, choices: { main: "bomba", c1: "bomba" } }, CONCEPTS);
  expect(x.missing.join()).toContain("no es de la categoría");
  expect(x.lines).toEqual([]);
});

test("un concepto inactivo, sin precio o borrado ya no está disponible", () => {
  for (const c1 of ["vieja", "sinprecio", "borrado"]) {
    const x = expandKit(BOMBA_DEF, { quantity: "1", params: { distancia: "5" }, choices: { main: "bomba", c1 } }, CONCEPTS);
    expect(x.missing).toEqual(["Manguera ya no está disponible"]);
  }
});

test("«1,5» se lee exacto y «1.500» es ambiguo; N debe ser mayor que cero", () => {
  const ok = expandKit(BOMBA_DEF, { quantity: "2", params: { distancia: "1,5" }, choices: { main: "bomba", c1: "manguera" } }, CONCEPTS);
  expect(ok.lines[1].quantity.toFixed(1)).toBe("3.0");
  const amb = expandKit(BOMBA_DEF, { quantity: "2", params: { distancia: "1.500" }, choices: { main: "bomba", c1: "manguera" } }, CONCEPTS);
  expect(amb.missing).toEqual(["Distancia al cuadro no es un número válido"]);
  const zero = expandKit(BOMBA_DEF, { quantity: "0", params: { distancia: "1" }, choices: { main: "bomba", c1: "manguera" } }, CONCEPTS);
  expect(zero.missing).toEqual(["La cantidad debe ser mayor que cero"]);
});

const PARAM_DEF = (required: boolean): KitDefinition => ({
  main: { conceptId: "cuadro", label: "Cuadro" },
  params: [{ key: "q_c1", label: "Manguera: cantidad", unit: "m", required }],
  components: [{ slot: "c1", label: "Manguera", ref: { conceptId: "manguera" }, required, formula: { type: "PARAM", param: "q_c1", k: "1" } }],
});

test("PARAM: cantidad = k × dato, sin depender de N", () => {
  const x = expandKit(PARAM_DEF(true), { quantity: "3", params: { q_c1: "25" }, choices: {} }, CONCEPTS);
  expect(x.missing).toEqual([]);
  expect(x.lines.map((l) => [l.slot, l.quantity.toFixed(0)])).toEqual([["main", "3"], ["c1", "25"]]);
});

test("PARAM opcional con el dato vacío no añade línea; obligatorio deja el conjunto incompleto", () => {
  const opt = expandKit(PARAM_DEF(false), { quantity: "1", params: {}, choices: {} }, CONCEPTS);
  expect(opt.lines.map((l) => l.slot)).toEqual(["main"]);
  const req = expandKit(PARAM_DEF(true), { quantity: "1", params: {}, choices: {} }, CONCEPTS);
  expect(req.lines).toEqual([]);
  expect(req.missing).toEqual(["Falta el dato Manguera: cantidad"]);
});

test("PARAM con un dato que no existe se rechaza", () => {
  const bad = { ...PARAM_DEF(true), params: [] };
  expect(kitDefinitionSchema.safeParse(bad).success).toBe(false);
});

test("definiciones antiguas siguen siendo válidas y se admiten etiquetas de 300", () => {
  expect(kitDefinitionSchema.parse(BOMBA_DEF)).toEqual(BOMBA_DEF);
  const withLabel = (n: number) => ({ ...BOMBA_DEF, main: { categoryId: "cat-bombas", label: "x".repeat(n) } });
  expect(kitDefinitionSchema.safeParse(withLabel(300)).success).toBe(true);
  expect(kitDefinitionSchema.safeParse(withLabel(301)).success).toBe(false);
});

const FIX_DEF: KitDefinition = {
  main: { conceptId: "cuadro", label: "Cuadro" }, params: [],
  components: [
    { slot: "c1", label: "Fija", ref: { conceptId: "manguera" }, required: true, formula: { type: "FIXED", k: "3" } },
    { slot: "c2", label: "Por N", ref: { conceptId: "bomba" }, required: true, formula: { type: "PER_QTY", k: "2" } },
  ],
};

test("una medida modificada (k_<slot>) sustituye a k en FIXED y PER_QTY", () => {
  const x = expandKit(FIX_DEF, { quantity: "5", params: { k_c1: "1,5", k_c2: "3" }, choices: {} }, CONCEPTS);
  expect(x.missing).toEqual([]);
  expect(x.lines.map((l) => [l.conceptId, l.quantity.toString()])).toEqual([["cuadro", "5"], ["manguera", "1.5"], ["bomba", "15"]]);
});

test("una medida modificada no numérica deja el conjunto incompleto", () => {
  const x = expandKit(FIX_DEF, { quantity: "5", params: { k_c1: "abc" }, choices: {} }, CONCEPTS);
  expect(x.lines).toEqual([]);
  expect(x.missing).toContain("Fija: medida no válida");
});

test("medida modificada 0 deja fuera el material sin error", () => {
  const x = expandKit(FIX_DEF, { quantity: "5", params: { k_c1: "0" }, choices: {} }, CONCEPTS);
  expect(x.missing).toEqual([]);
  expect(x.lines.map((l) => l.slot)).toEqual(["main", "c2"]);
});

test("k_<slot> se ignora en materiales con cantidad escrita", () => {
  const x = expandKit(BOMBA_DEF, { quantity: "2", params: { distancia: "10", k_c1: "9" }, choices: { main: "bomba", c1: "manguera" } }, CONCEPTS);
  expect(x.lines.map((l) => [l.slot, l.quantity.toFixed(0)])).toEqual([["main", "2"], ["c1", "20"]]);
});

// Conjuntos dinámicos (plan 2026-11-25, tarea 2).
const DYN_CONCEPTS = new Map([
  ...CONCEPTS,
  ["cpu", concept("cpu", "cat-cpu", "800")],
  ["im", concept("im", "cat-im", "300")],
  ["di8", concept("di8", "cat-di", "50")],
  ["di16", concept("di16", "cat-di", "70")],
  ["dioff", concept("dioff", "cat-di", "50", false)],
  ["f1", concept("f1", "cat-safety", "200")],
]);
const ED = { key: "t1", label: "Entradas digitales", abbr: "ED", red: false, variants: { categoryId: "cat-di" } };
const SAFETY = { key: "t2", label: "Safety", abbr: "F", red: true, variants: { conceptIds: ["f1"] } };
const SUELTO: KitDefinition = { kind: "dynamic", params: [], components: [], slotTypes: [ED, SAFETY] };
const PERIFERIA: KitDefinition = {
  kind: "dynamic", main: { conceptId: "im", label: "Cabecera" }, params: [], slotTypes: [ED],
  components: [{ slot: "c1", label: "Bastidor", ref: { conceptId: "cuadro" }, required: true, formula: { type: "FIXED", k: "1" } }],
};
const plc = (dyn: Partial<NonNullable<KitDefinition["dynamics"]>[number]> = {}): KitDefinition => ({
  main: { conceptId: "cpu", label: "CPU" }, params: [],
  components: [{ slot: "c1", label: "Manguera", ref: { conceptId: "manguera" }, required: true, formula: { type: "FIXED", k: "1" } }],
  dynamics: [{ slot: "d1", label: "Periferia", choice: { templateId: "tpl-et" }, optional: false, copies: { "tpl-et": { name: "ET", definition: PERIFERIA } }, ...dyn }],
});
const slot = (id: string, type: string, conceptId: string | null, quantity = "1", group = "self") => ({ id, group, type, conceptId, quantity });
const keys = (x: ReturnType<typeof expandKit>) => x.lines.map((l) => [l.slot, l.quantity.toFixed()]);

test("un dinámico suelto sin principal solo lleva sus slots", () => {
  const x = expandKit(SUELTO, { quantity: "1", params: {}, choices: {}, slots: [slot("a", "t1", "di8", "3"), slot("b", "t2", "f1")] }, DYN_CONCEPTS);
  expect(x.missing).toEqual([]);
  expect(keys(x)).toEqual([["s:a", "3"], ["s:b", "1"]]);
});

test("un PLC con dinámico fijo coloca su principal, sus fijos y sus slots tras los materiales", () => {
  const x = expandKit(plc(), { quantity: "2", params: {}, choices: { d1: "tpl-et" }, slots: [slot("a", "t1", "di8", "2", "d1")] }, DYN_CONCEPTS);
  expect(x.missing).toEqual([]);
  expect(keys(x)).toEqual([["main", "2"], ["c1", "1"], ["d1/main", "1"], ["d1/c1", "1"], ["d1/s:a", "2"]]);
});

test("los slots salen en el orden de los tipos y luego en el de alta", () => {
  const x = expandKit(SUELTO, { quantity: "1", params: {}, choices: {}, slots: [slot("x", "t2", "f1"), slot("y", "t1", "di8"), slot("z", "t1", "di16")] }, DYN_CONCEPTS);
  expect(x.lines.map((l) => l.slot)).toEqual(["s:y", "s:z", "s:x"]);
});

test("un dinámico opcional sin colocar no falta; uno obligatorio sí", () => {
  expect(expandKit(plc({ optional: true }), { quantity: "1", params: {}, choices: {} }, DYN_CONCEPTS).missing).toEqual([]);
  expect(expandKit(plc(), { quantity: "1", params: {}, choices: {} }, DYN_CONCEPTS).missing).toEqual(["Falta Periferia"]);
  expect(expandKit(plc({ choice: { templateIds: ["tpl-et", "tpl-b"] } }), { quantity: "1", params: {}, choices: {} }, DYN_CONCEPTS).missing).toEqual(["Falta elegir Periferia"]);
});

test("elegir dinámico: uno fuera de la lista no cuenta", () => {
  const d = plc({ choice: { templateIds: ["tpl-et", "tpl-b"] } });
  expect(expandKit(d, { quantity: "1", params: {}, choices: { d1: "otro" } }, DYN_CONCEPTS).missing).toEqual(["Falta elegir Periferia"]);
  expect(expandKit(d, { quantity: "1", params: {}, choices: { d1: "tpl-b" } }, DYN_CONCEPTS).missing).toEqual(["Periferia ya no está disponible"]);
});

test("slot sin variante, con cantidad 0 o con un artículo que no es variante deja el conjunto incompleto y sin líneas", () => {
  const x = expandKit(SUELTO, { quantity: "1", params: {}, choices: {}, slots: [slot("a", "t1", null), slot("b", "t1", "di8", "0"), slot("c", "t1", "manguera"), slot("d", "t2", "f1")] }, DYN_CONCEPTS);
  expect(x.lines).toEqual([]);
  expect(x.missing).toEqual(["Falta elegir la variante en Entradas digitales", "Entradas digitales: cantidad no válida", "Entradas digitales: manguera no es una variante válida"]);
});

test("variante por categoría acepta cualquier artículo de esa categoría", () => {
  const x = expandKit(SUELTO, { quantity: "1", params: {}, choices: {}, slots: [slot("a", "t1", "di16", "1,5")] }, DYN_CONCEPTS);
  expect(keys(x)).toEqual([["s:a", "1.5"]]);
});

test("una variante desactivada deja el conjunto incompleto", () => {
  const x = expandKit(SUELTO, { quantity: "1", params: {}, choices: {}, slots: [slot("a", "t1", "dioff")] }, DYN_CONCEPTS);
  expect(x.missing).toEqual(["Entradas digitales ya no está disponible"]);
});

test("un slot de un dinámico no colocado o de un tipo que ya no existe se ignora", () => {
  const x = expandKit(SUELTO, { quantity: "1", params: {}, choices: {}, slots: [slot("a", "t9", "di8"), slot("b", "t1", "di8", "1", "d1")] }, DYN_CONCEPTS);
  expect(x).toEqual({ lines: [], missing: [] });
});

test("slotTypeOf lee el tipo propio o el de la copia del dinámico elegido", () => {
  expect(slotTypeOf(SUELTO, {}, "self", "t2")?.label).toBe("Safety");
  expect(slotTypeOf(plc(), { d1: "tpl-et" }, "d1", "t1")?.label).toBe("Entradas digitales");
  expect(slotTypeOf(plc(), {}, "d1", "t1")).toBeUndefined();
});

test("una variante sin precio deja todo el conjunto sin valorar en modo suma", () => {
  const concepts = new Map(DYN_CONCEPTS);
  concepts.set("di8", { ...concepts.get("di8")!, salePrice: null });
  const x = expandKit(SUELTO, { quantity: "1", params: {}, choices: {}, slots: [slot("a", "t1", "di8"), slot("b", "t2", "f1")] }, concepts);
  expect(x).toEqual({ lines: [], missing: ["Entradas digitales ya no está disponible"] });
});

test("una variante sin precio se admite como línea descriptiva en precio global", () => {
  const concepts = new Map(DYN_CONCEPTS);
  concepts.set("di8", { ...concepts.get("di8")!, salePrice: null });
  const x = expandKit(SUELTO, { quantity: "1", params: {}, choices: {}, slots: [slot("a", "t1", "di8")] }, concepts, true);
  expect(x.missing).toEqual([]);
  expect(keys(x)).toEqual([["s:a", "1"]]);
});
