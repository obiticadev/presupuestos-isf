import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { setConceptActive } from "@/modules/catalog/service";
import type { KitDefinition } from "@/modules/kits/definition";
import { getKit, kitIssues, kitUses, listKits, removeKit, saveKit, setKitActive } from "@/modules/kits/service";
import { addKitInstance } from "@/modules/quotes/kit-instances";
import { makeDraft } from "../helpers/quotes";
import { makeUser } from "../helpers/users";

const def = (over: Partial<KitDefinition> = {}): KitDefinition => ({
  main: { conceptId: "concept-ser-prog", label: "Programación" },
  params: [{ key: "entradas", label: "Entradas", unit: "ud", required: true }],
  components: [{ slot: "c1", label: "Manguera", ref: { conceptId: "concept-man-12x075" }, required: true, formula: { type: "PER_QTY_AND_PARAM", param: "entradas", k: "2" } }],
  ...over,
});

test("la semilla trae «Instalación de bomba»", async () => {
  expect((await listKits()).map((k) => k.name)).toEqual(["Instalación de bomba"]);
  const k = await getKit("kit-bomba");
  expect(k.definition.components[0].formula).toEqual({ type: "PER_QTY_AND_PARAM", param: "distancia", k: "1" });
});

test("guardar, renombrar y desactivar un conjunto; queda en el historial", async () => {
  const admin = await makeUser("admin");
  const k = await saveKit(admin, { name: "Cuadro con PLC", description: "", definition: def() });
  await saveKit(admin, { id: k.id, name: "Cuadro PLC", description: "x", definition: def() });
  await setKitActive(admin, k.id, false);
  expect((await listKits()).map((x) => x.name)).toEqual(["Instalación de bomba"]);
  expect((await listKits({ includeInactive: true })).map((x) => x.name)).toContain("Cuadro PLC");
  expect(await prisma.auditLog.count({ where: { entity: "kit", entityId: k.id } })).toBe(3);
});

test("una fórmula que usa un dato inexistente se rechaza", async () => {
  const admin = await makeUser("admin");
  const bad = def({ components: [{ slot: "c1", label: "M", ref: { conceptId: "concept-man-12x075" }, required: true, formula: { type: "PER_QTY_AND_PARAM", param: "altura", k: "1" } }] });
  await expect(saveKit(admin, { name: "X", description: "", definition: bad })).rejects.toThrow(ValidationError);
});

test("k vacío o no numérico se rechaza", async () => {
  const admin = await makeUser("admin");
  const bad = def({ components: [{ slot: "c1", label: "M", ref: { conceptId: "concept-man-12x075" }, required: true, formula: { type: "FIXED", k: "" } }] });
  await expect(saveKit(admin, { name: "X", description: "", definition: bad })).rejects.toThrow(ValidationError);
});

test("un concepto desactivado o inexistente no se puede referenciar", async () => {
  const admin = await makeUser("admin");
  await setConceptActive(admin, "concept-ser-prog", false);
  await expect(saveKit(admin, { name: "X", description: "", definition: def() })).rejects.toThrow(ValidationError);
  await expect(saveKit(admin, { name: "Y", description: "", definition: def({ main: { categoryId: "no-existe", label: "B" } }) })).rejects.toThrow(ValidationError);
});

test("nombre repetido se rechaza", async () => {
  const admin = await makeUser("admin");
  await expect(saveKit(admin, { name: "Instalación de bomba", description: "", definition: def() })).rejects.toThrow("Ya existe un conjunto con ese nombre");
});

test("un presupuestador guarda y desactiva un conjunto", async () => {
  const p = await makeUser("presupuestador");
  const k = await saveKit(p, { name: "X", description: "", definition: def() });
  await setKitActive(p, k.id, false);
  expect((await getKit(k.id)).active).toBe(false);
});

const seedDef = (): KitDefinition => {
  const d = BOMBA_SEED();
  return { ...d, components: d.components.map((c, i) => ({ ...c, inName: i === 0 })) };
};
const BOMBA_SEED = (): KitDefinition => ({
  main: { categoryId: "cat-bombas", label: "Bombas" },
  params: [{ key: "q_c1", label: "Mangueras: cantidad", unit: "", required: true }],
  components: [{ slot: "c1", label: "Mangueras", ref: { categoryId: "cat-mangueras" }, required: true, formula: { type: "PER_QTY_AND_PARAM", param: "q_c1", k: "1" } }],
});

test("sin nombre, saveKit pone el automático y su símbolo; si se repite, -2", async () => {
  const p = await makeUser("presupuestador");
  const a = await saveKit(p, { description: "", definition: seedDef() });
  expect(a.name).toBe("BOM-MAN");
  expect(a.definition.main?.symbol).toBe("BO");
  expect((await saveKit(p, { description: "", definition: seedDef() })).name).toBe("BOM-MAN-2");
});

test("editar un conjunto con nombre automático no lo renombra a -2", async () => {
  const p = await makeUser("presupuestador");
  const a = await saveKit(p, { description: "", definition: seedDef() });
  expect((await saveKit(p, { id: a.id, description: "x", definition: seedDef() })).name).toBe("BOM-MAN");
});

test("un artículo fijo da el prefijo de su código", async () => {
  const p = await makeUser("presupuestador");
  const d = def();
  const k = await saveKit(p, { description: "", definition: { ...d, components: d.components.map((c) => ({ ...c, inName: true })) } });
  expect(k.name).toBe("SER-MAN");
});

test("un conjunto sin usar se elimina y queda en el historial", async () => {
  const p = await makeUser("presupuestador");
  const k = await saveKit(p, { name: "Para borrar", description: "", definition: def() });
  expect(await kitUses(k.id)).toBe(0);
  await removeKit(p, k.id);
  await expect(getKit(k.id)).rejects.toThrow("Conjunto no encontrado");
  expect(await prisma.auditLog.count({ where: { entity: "kit", entityId: k.id, action: "delete" } })).toBe(1);
});

test("un conjunto usado en un presupuesto no se elimina", async () => {
  const { actor, sub } = await makeDraft();
  await addKitInstance(actor, sub.id, { templateId: "kit-bomba", quantity: "1", params: {}, choices: {} });
  expect(await kitUses("kit-bomba")).toBe(1);
  await expect(removeKit(actor, "kit-bomba")).rejects.toThrow("Se usa en 1 presupuesto: desactívalo en su lugar");
  expect((await getKit("kit-bomba")).active).toBe(true);
});

test("dos conjuntos iguales en el mismo presupuesto cuentan como un presupuesto", async () => {
  const { actor, sub } = await makeDraft();
  await addKitInstance(actor, sub.id, { templateId: "kit-bomba", quantity: "1", params: {}, choices: {} });
  await addKitInstance(actor, sub.id, { templateId: "kit-bomba", quantity: "2", params: {}, choices: {} });
  expect(await kitUses("kit-bomba")).toBe(1);
});

test("el símbolo no lleva guiones aunque el prefijo del principal sea de una letra", async () => {
  const p = await makeUser("presupuestador");
  const d = def();
  await prisma.category.create({ data: { id: "cat-x", name: "X" } });
  const k = await saveKit(p, { description: "", definition: { ...d, main: { categoryId: "cat-x", label: "X" }, components: d.components.map((c) => ({ ...c, inName: true })) } });
  expect(k.name).toBe("X-MAN");
  expect(k.definition.main?.symbol).toBe("XM");
});

test("un dinámico sin principal se nombra con las abreviaturas de sus tres primeros tipos", async () => {
  const p = await makeUser("presupuestador");
  const type = (key: string, abbr: string) => ({ key, label: abbr, abbr, red: false, variants: { categoryId: "cat-bombas" } });
  const k = await saveKit(p, { description: "", definition: { kind: "dynamic", params: [], components: [], slotTypes: [type("t1", "ED"), type("t2", "SD"), type("t3", "F"), type("t4", "AI")] } });
  expect(k.name).toBe("ED-SD-F");
  expect(k.definition.main).toBeUndefined();
});

test("un dinámico marcado «en el nombre» añade las dos primeras letras de su plantilla", async () => {
  const p = await makeUser("presupuestador");
  const dyn = await saveKit(p, { name: "ET200SP", description: "", definition: { kind: "dynamic", params: [], components: [], slotTypes: [{ key: "t1", label: "ED", abbr: "ED", red: false, variants: { categoryId: "cat-bombas" } }] } });
  const k = await saveKit(p, { description: "", definition: def({ params: [], components: [], dynamics: [{ slot: "d1", label: "Periferia", choice: { templateId: dyn.id }, optional: false, inName: true }] }) });
  expect(k.name).toMatch(/-ET$/);
});

const peri = (p: Parameters<typeof saveKit>[0]) => saveKit(p, { name: "PERI", description: "", definition: {
  kind: "dynamic", params: [], components: [],
  slotTypes: [{ key: "t1", label: "Entradas digitales", abbr: "ED", red: false, variants: { conceptIds: ["concept-man-4x25"] } }],
} });
const withDynamic = (templateId: string) => def({ dynamics: [{ slot: "d1", label: "Periferia", choice: { templateId }, optional: false }] });

test("un normal no puede usar un conjunto normal como dinámico", async () => {
  const p = await makeUser("presupuestador");
  await expect(saveKit(p, { name: "PLC", description: "", definition: withDynamic("kit-bomba") })).rejects.toThrow(ValidationError);
  await expect(saveKit(p, { name: "PLC", description: "", definition: withDynamic("no-existe") })).rejects.toThrow(ValidationError);
});

test("una variante desactivada o que no existe impide guardar el dinámico", async () => {
  const p = await makeUser("presupuestador");
  const bad = { kind: "dynamic" as const, params: [], components: [], slotTypes: [{ key: "t1", label: "ED", abbr: "ED", red: false, variants: { conceptIds: ["no-existe"] } }] };
  await expect(saveKit(p, { name: "X", description: "", definition: bad })).rejects.toThrow(ValidationError);
});

test("no se borra un dinámico que usa otro conjunto", async () => {
  const p = await makeUser("presupuestador");
  const dyn = await peri(p);
  await saveKit(p, { name: "PLC", description: "", definition: withDynamic(dyn.id) });
  expect(await kitUses(dyn.id)).toBe(1);
  await expect(removeKit(p, dyn.id)).rejects.toThrow("Se usa en 1 presupuestos o conjuntos: desactívalo en su lugar");
});

test("desactivar un dinámico avisa en el conjunto que lo usa", async () => {
  const admin = await makeUser("admin");
  const dyn = await peri(admin);
  const plc = await saveKit(admin, { name: "PLC", description: "", definition: withDynamic(dyn.id) });
  expect(await kitIssues(prisma, plc)).toEqual([]);
  await setKitActive(admin, dyn.id, false);
  expect(await kitIssues(prisma, plc)).toEqual(["Periferia: ese conjunto ya no está disponible"]);
});
