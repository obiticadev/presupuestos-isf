import { prisma } from "@/lib/db";
import { removeConcept, setConceptActive } from "@/modules/catalog/service";
import { kitsUsingConcepts, usedConceptIds } from "@/modules/catalog/usage";
import { getKit, kitIssues, saveKit } from "@/modules/kits/service";
import { addKitInstance } from "@/modules/quotes/kit-instances";
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
