import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { setConceptActive } from "@/modules/catalog/service";
import type { KitDefinition } from "@/modules/kits/definition";
import { getKit, listKits, saveKit, setKitActive } from "@/modules/kits/service";
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
  expect(a.definition.main.symbol).toBe("BO");
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
