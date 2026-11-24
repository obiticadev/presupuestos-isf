import { getKitHistory, kitChanges, kitLines } from "@/modules/kits/history";
import type { KitDefinition } from "@/modules/kits/definition";
import { getKit, saveKit, setKitActive } from "@/modules/kits/service";
import { makeUser } from "../helpers/users";

const SEED: KitDefinition = {
  main: { categoryId: "cat-bombas", label: "Bomba" },
  params: [{ key: "distancia", label: "Distancia al cuadro", unit: "m", required: true }],
  components: [{ slot: "c1", label: "Manguera", ref: { categoryId: "cat-mangueras" }, required: true, formula: { type: "PER_QTY_AND_PARAM", param: "distancia", k: "1" } }],
};
const withValve: KitDefinition = { ...SEED, components: [...SEED.components,
  { slot: "c2", label: "Válvula", ref: { conceptId: "concept-ser-prog" }, required: true, formula: { type: "FIXED", k: "2" } }] };

test("el conjunto en frases", () => {
  expect(kitLines({ name: "BOM-MAN", description: "", definition: withValve })).toEqual([
    "Nombre: BOM-MAN", "Descripción: —", "Principal: Bomba (se elige al presupuestar)",
    "Manguera (se elige al presupuestar): cantidad al presupuestar × principal", "Válvula: 2 en total",
  ]);
});

test("qué cambió entre dos versiones", () => {
  expect(kitChanges({ name: "A", description: "", definition: withValve }, { name: "A", description: "", definition: SEED }))
    .toEqual({ added: ["Válvula: 2 en total"], removed: [] });
  expect(kitChanges({ name: "B", description: "", definition: SEED }, { name: "A", description: "", definition: withValve }))
    .toEqual({ added: ["Nombre: B"], removed: ["Nombre: A", "Válvula: 2 en total"] });
});

test("una entrada antigua sin nombre no da cambios de nombre ni de descripción", () => {
  expect(kitChanges({ name: "BOM-MAN", description: "x", definition: SEED }, { definition: SEED })).toEqual({ added: [], removed: [] });
});

test("alta, cambio y desactivación dan 3 versiones, la más nueva primero", async () => {
  const p = await makeUser("presupuestador");
  const k = await saveKit(p, { name: "Uno", description: "", definition: SEED });
  await saveKit(p, { id: k.id, name: "Uno", description: "", definition: withValve });
  await setKitActive(p, k.id, false);
  const h = await getKitHistory(k.id);
  expect(h.map((v) => v.snapshot === null)).toEqual([true, false, false]);
  expect(kitChanges(h[1].snapshot!, h[2].snapshot!).added).toEqual(["Válvula: 2 en total"]);
  expect(h[1].snapshot!.name).toBe("Uno");
  expect((await getKit(k.id)).name).toBe("Uno");
});
