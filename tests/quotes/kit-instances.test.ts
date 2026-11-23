import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { getConcept, setConceptActive, updateConcept } from "@/modules/catalog/service";
import { getKit, saveKit, setKitActive } from "@/modules/kits/service";
import { addKitInstance, removeKitInstance, updateKitInstance } from "@/modules/quotes/kit-instances";
import { addCatalogLine, adjustPrice, getQuote, removeLine, updateLine, updateSection } from "@/modules/quotes/service";
import { conceptFields, makeDraft } from "../helpers/quotes";

const bombas = { templateId: "kit-bomba", quantity: "2", params: { distancia: "10" }, choices: { main: "concept-bom-mayor75", c1: "concept-man-4x25" } };

test("insertar el conjunto de bombas da 404,00 en el total", async () => {
  const { actor, quote, sub } = await makeDraft();
  const k = await addKitInstance(actor, sub.id, bombas);
  const q = await getQuote(quote.id);
  expect(q.base.toFixed(2)).toBe("404.00");
  const lines = q.sections[0].children[0].lines;
  expect(lines.map((l) => [l.kitInstanceId, l.kitSlot, l.quantity.toFixed(0)])).toEqual([[k.id, "main", "2"], [k.id, "c1", "20"]]);
  expect(q.sections[0].children[0].kits.map((x) => [x.name, x.missing])).toEqual([["Instalación de bomba", []]]);
});

test("cambiar N o la distancia recalcula las líneas", async () => {
  const { actor, quote, sub } = await makeDraft();
  const k = await addKitInstance(actor, sub.id, bombas);
  await updateKitInstance(actor, k.id, { ...bombas, quantity: "3" });
  expect((await getQuote(quote.id)).base.toFixed(2)).toBe("606.00");
  await updateKitInstance(actor, k.id, { ...bombas, quantity: "3", params: { distancia: "1,5" } });
  expect((await getQuote(quote.id)).base.toFixed(2)).toBe("351.00"); // 3 × 102 + 4,5 × 10
});

test("sin manguera el conjunto queda incompleto y no suma; elegirla después lo valora", async () => {
  const { actor, quote, sub } = await makeDraft();
  const k = await addKitInstance(actor, sub.id, { ...bombas, quantity: "1", choices: { main: "concept-bom-mayor75" } });
  let q = await getQuote(quote.id);
  expect([q.base.toFixed(2), q.sections[0].children[0].kits[0].missing]).toEqual(["0.00", ["Falta elegir Manguera"]]);
  await updateKitInstance(actor, k.id, { ...bombas, quantity: "1" });
  q = await getQuote(quote.id);
  expect(q.base.toFixed(2)).toBe("202.00");
});

test("una cantidad ambigua o no numérica se rechaza", async () => {
  const { actor, sub } = await makeDraft();
  await expect(addKitInstance(actor, sub.id, { ...bombas, quantity: "1.500" })).rejects.toThrow("ambiguo");
});

test("cambiar la plantilla o el catálogo después no altera la instancia insertada", async () => {
  const { actor, admin, quote, sub } = await makeDraft();
  const k = await addKitInstance(actor, sub.id, bombas);
  const kit = await getKit("kit-bomba");
  await saveKit(admin, { id: kit.id, name: kit.name, description: kit.description, definition: {
    ...kit.definition, components: [{ ...kit.definition.components[0], formula: { type: "PER_QTY_AND_PARAM", param: "distancia", k: "2" } }],
  } });
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), salePrice: "99" });
  await updateKitInstance(actor, k.id, bombas); // recalcular con la copia: sigue k = 1 y el precio copiado
  expect((await getQuote(quote.id)).base.toFixed(2)).toBe("404.00");
});

test("el ajuste de precio exige motivo, queda registrado y sobrevive a un recálculo del mismo concepto", async () => {
  const { actor, quote, sub } = await makeDraft();
  const k = await addKitInstance(actor, sub.id, bombas);
  const hose = (await getQuote(quote.id)).sections[0].children[0].lines.find((l) => l.kitSlot === "c1")!;
  await expect(adjustPrice(actor, hose.id, { newPrice: "9", reason: " " })).rejects.toThrow(ValidationError);
  await adjustPrice(actor, hose.id, { newPrice: "9", reason: "Cliente habitual" });
  await updateKitInstance(actor, k.id, { ...bombas, params: { distancia: "20" } });
  const q = await getQuote(quote.id);
  const line = q.sections[0].children[0].lines.find((l) => l.kitSlot === "c1")!;
  expect([line.unitPrice?.toFixed(2), line.adjustments[0].originalPrice.toFixed(2), line.adjustments[0].reason]).toEqual(["9.00", "10.00", "Cliente habitual"]);
  expect(q.base.toFixed(2)).toBe("564.00"); // 2 × 102 + 40 × 9
  expect(await prisma.auditLog.count({ where: { entity: "quote", entityId: quote.id, action: "adjust" } })).toBe(1);
});

test("si cambia el concepto elegido, el ajuste se descarta y se avisa en el historial", async () => {
  const { actor, quote, sub } = await makeDraft();
  const k = await addKitInstance(actor, sub.id, bombas);
  const hose = (await getQuote(quote.id)).sections[0].children[0].lines.find((l) => l.kitSlot === "c1")!;
  await adjustPrice(actor, hose.id, { newPrice: "9", reason: "Oferta" });
  await updateKitInstance(actor, k.id, { ...bombas, choices: { main: "concept-bom-mayor75", c1: "concept-man-12x075" } });
  const line = (await getQuote(quote.id)).sections[0].children[0].lines.find((l) => l.kitSlot === "c1")!;
  expect([line.unitPrice?.toFixed(2), line.adjustments]).toEqual(["15.00", []]);
  expect(await prisma.auditLog.count({ where: { entityId: quote.id, summary: { contains: "Ajuste descartado" } } })).toBe(1);
});

test("un ajuste en una línea suelta funciona; en una línea descriptiva no", async () => {
  const { actor, quote, sub } = await makeDraft();
  const l = await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "2" });
  await adjustPrice(actor, l.id, { newPrice: "45,5", reason: "Tarifa acordada" });
  expect((await getQuote(quote.id)).base.toFixed(2)).toBe("91.00");
  await updateSection(actor, sub.id, { mode: "GLOBAL" });
  const d = await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-despl", quantity: "1" });
  await expect(adjustPrice(actor, d.id, { newPrice: "1", reason: "x" })).rejects.toThrow(ValidationError);
});

test("en una subpartida de precio global se inserta un conjunto: obliga a completarlo y sus líneas no suman", async () => {
  const { actor, quote, sub } = await makeDraft();
  await updateSection(actor, sub.id, { mode: "GLOBAL", globalQty: "1", globalPrice: "1000" });
  const k = await addKitInstance(actor, sub.id, { ...bombas, choices: { main: "concept-bom-mayor75" } });
  let q = await getQuote(quote.id);
  expect([q.base.toFixed(2), q.sections[0].children[0].kits[0].missing]).toEqual(["1000.00", ["Falta elegir Manguera"]]);
  await updateKitInstance(actor, k.id, bombas);
  q = await getQuote(quote.id);
  expect([q.base.toFixed(2), q.sections[0].children[0].lines.length, q.sections[0].children[0].kits[0].missing]).toEqual(["1000.00", 2, []]);
});

test("en global el conjunto admite piezas sin precio de venta; por suma, no", async () => {
  const { actor, admin, quote, sub } = await makeDraft();
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), salePrice: "" });
  const k = await addKitInstance(actor, sub.id, bombas);
  expect((await getQuote(quote.id)).sections[0].children[0].kits[0].missing).toEqual(["Manguera ya no está disponible"]);
  await updateSection(actor, sub.id, { mode: "GLOBAL", globalQty: "1", globalPrice: "1000" });
  await updateKitInstance(actor, k.id, bombas);
  const q = await getQuote(quote.id);
  expect([q.sections[0].children[0].kits[0].missing, q.sections[0].children[0].lines.length]).toEqual([[], 2]);
});

test("las líneas de un conjunto solo cambian su visibilidad a mano", async () => {
  const { actor, quote, sub } = await makeDraft();
  await addKitInstance(actor, sub.id, bombas);
  const main = (await getQuote(quote.id)).sections[0].children[0].lines[0];
  await expect(updateLine(actor, main.id, { quantity: "5" })).rejects.toThrow(ValidationError);
  await expect(removeLine(actor, main.id)).rejects.toThrow(ValidationError);
  await updateLine(actor, main.id, { visible: false });
  expect((await getQuote(quote.id)).sections[0].children[0].lines[0].visible).toBe(false);
});

test("un conjunto desactivado no se puede insertar; quitar una instancia quita sus líneas", async () => {
  const { actor, admin, quote, sub } = await makeDraft();
  const k = await addKitInstance(actor, sub.id, bombas);
  await removeKitInstance(actor, k.id);
  const q = await getQuote(quote.id);
  expect([q.sections[0].children[0].lines.length, q.base.toFixed(2)]).toEqual([0, "0.00"]);
  await setKitActive(admin, "kit-bomba", false);
  await expect(addKitInstance(actor, sub.id, bombas)).rejects.toThrow(ValidationError);
});

test("un concepto elegido que luego se desactiva deja la instancia incompleta al recalcular", async () => {
  const { actor, admin, quote, sub } = await makeDraft();
  const k = await addKitInstance(actor, sub.id, bombas);
  await setConceptActive(admin, "concept-man-4x25", false);
  await updateKitInstance(actor, k.id, bombas);
  const q = await getQuote(quote.id);
  expect([q.base.toFixed(2), q.sections[0].children[0].kits[0].missing]).toEqual(["0.00", ["Manguera ya no está disponible"]]);
});
