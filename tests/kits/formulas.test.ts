import { Prisma } from "@/generated/prisma/client";
import type { KitDefinition } from "@/modules/kits/definition";
import { kitDefinition as kitDefinitionSchema } from "@/modules/kits/definition";
import { expandKit, type ConceptForKit } from "@/modules/kits/formulas";
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
