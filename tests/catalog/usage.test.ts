import { prisma } from "@/lib/db";
import { removeConcept, setConceptActive } from "@/modules/catalog/service";
import { kitsUsingConcepts, usedConceptIds } from "@/modules/catalog/usage";
import { getKit, kitIssues, saveKit, setKitActive } from "@/modules/kits/service";
import { addKitInstance, addKitSlot, updateKitSlot } from "@/modules/quotes/kit-instances";
import { addCatalogLine } from "@/modules/quotes/service";
import { makeDraft } from "../helpers/quotes";
import { makeUser } from "../helpers/users";

const bombaKit = (id: string) => ({
  name: "Bomba", description: "",
  definition: { main: { conceptId: id, label: "Bomba" }, params: [], components: [] },
});

test("un concepto que solo está en una plantilla de conjunto se desactiva al eliminarlo", async () => {
  const p = await makeUser("presupuestador");
  await saveKit(p, bombaKit("concept-bom-hasta75"));
  expect(await removeConcept(p, "concept-bom-hasta75")).toEqual({ outcome: "deactivated", incompleteKits: ["Bomba"] });
  expect(await prisma.auditLog.findFirst({ where: { entityId: "concept-bom-hasta75", action: "deactivate" } })).toMatchObject({ summary: "BOM-HASTA75 desactivado porque está en uso" });
});

test("desactivar un concepto dice qué conjuntos activos quedan incompletos", async () => {
  const p = await makeUser("presupuestador");
  await saveKit(p, bombaKit("concept-bom-hasta75"));
  expect(await setConceptActive(p, "concept-bom-hasta75", false)).toEqual({ incompleteKits: ["Bomba"] });
  expect(await setConceptActive(p, "concept-bom-hasta75", true)).toEqual({ incompleteKits: [] });
});

test("usedConceptIds cuenta líneas, obligatorios, plantillas y conjuntos de presupuestos", async () => {
  const { actor, sub } = await makeDraft();
  const p = await makeUser("presupuestador");
  expect(await usedConceptIds(prisma)).toEqual(new Set(["concept-ser-despl", "concept-ser-prog"])); // obligatorios de la semilla
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-12x075", quantity: "1" });
  await saveKit(p, bombaKit("concept-bom-hasta75"));
  await addKitInstance(actor, sub.id, { templateId: "kit-bomba", quantity: "1", params: { distancia: "5" }, choices: { main: "concept-bom-mayor75", c1: "concept-man-4x25" } });
  expect(await usedConceptIds(prisma)).toEqual(new Set(["concept-ser-despl", "concept-ser-prog", "concept-man-12x075", "concept-bom-hasta75", "concept-bom-mayor75", "concept-man-4x25"]));
  expect(await kitsUsingConcepts(prisma, ["concept-bom-hasta75"])).toEqual([{ name: "Bomba", codes: ["BOM-HASTA75"] }]);
});

test("kitIssues avisa de un concepto desactivado", async () => {
  const p = await makeUser("presupuestador");
  const kit = await saveKit(p, bombaKit("concept-bom-hasta75"));
  expect(await kitIssues(prisma, kit)).toEqual([]);
  await setConceptActive(p, "concept-bom-hasta75", false);
  expect(await kitIssues(prisma, await getKit(kit.id))).toEqual(["BOM-HASTA75 está desactivado: cámbialo por otro"]);
});

const dynamicKit = () => ({
  name: "Tarjetas", description: "",
  definition: {
    kind: "dynamic" as const, params: [], components: [],
    slotTypes: [{ key: "t1", label: "Entradas", abbr: "ED", red: false, variants: { conceptIds: ["concept-man-12x075"] } }],
  },
});

test("eliminar una variante usada solo por un dinámico la desactiva y avisa del conjunto", async () => {
  const actor = await makeUser("presupuestador");
  await saveKit(actor, dynamicKit());
  expect(await removeConcept(actor, "concept-man-12x075")).toEqual({ outcome: "deactivated", incompleteKits: ["Tarjetas"] });
  expect(await prisma.concept.findUnique({ where: { id: "concept-man-12x075" } })).toMatchObject({ active: false });
});

test("las variantes de una plantilla desactivada siguen estando en uso", async () => {
  const actor = await makeUser("presupuestador");
  const kit = await saveKit(actor, dynamicKit());
  await setKitActive(actor, kit.id, false);
  expect(await removeConcept(actor, "concept-man-12x075")).toEqual({ outcome: "deactivated", incompleteKits: [] });
});

test("una variante en la copia de un dinámico queda protegida aunque cambie la plantilla", async () => {
  const { actor, sub } = await makeDraft();
  const dyn = await saveKit(actor, dynamicKit());
  const parent = await saveKit(actor, {
    ...bombaKit("concept-bom-hasta75"),
    definition: { ...bombaKit("concept-bom-hasta75").definition, dynamics: [
      { slot: "d1", label: "Tarjetas", choice: { templateId: dyn.id }, optional: true },
    ] },
  });
  await addKitInstance(actor, sub.id, { templateId: parent.id, quantity: "1", params: {}, choices: {} });
  await saveKit(actor, { ...dynamicKit(), id: dyn.id, definition: {
    ...dynamicKit().definition,
    slotTypes: [{ ...dynamicKit().definition.slotTypes[0], variants: { conceptIds: ["concept-man-4x25"] } }],
  } });
  expect(await removeConcept(actor, "concept-man-12x075")).toMatchObject({ outcome: "deactivated" });
});

test("un slot elegido por categoría protege el artículo aunque el borrador incompleto no tenga líneas", async () => {
  const { actor, sub } = await makeDraft();
  const dyn = await saveKit(actor, { ...dynamicKit(), definition: {
    ...dynamicKit().definition,
    slotTypes: [{ ...dynamicKit().definition.slotTypes[0], variants: { categoryId: "cat-mangueras" } }],
  } });
  const kit = await addKitInstance(actor, sub.id, { templateId: dyn.id, quantity: "1", params: {}, choices: {} });
  const slot = await addKitSlot(actor, kit.id, "self", "t1");
  await addKitSlot(actor, kit.id, "self", "t1"); // Incompleto desde el principio: nunca llega a crear líneas.
  await updateKitSlot(actor, kit.id, slot, { conceptId: "concept-man-12x075" });
  expect(await prisma.quoteLine.count({ where: { kitInstanceId: kit.id } })).toBe(0);
  expect(await removeConcept(actor, "concept-man-12x075")).toMatchObject({ outcome: "deactivated" });
});
