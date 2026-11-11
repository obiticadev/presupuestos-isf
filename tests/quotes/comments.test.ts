import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { issueQuote } from "@/modules/quotes/issue";
import { addKitInstance, updateKitInstance } from "@/modules/quotes/kit-instances";
import { createRevision, duplicateQuote } from "@/modules/quotes/lifecycle";
import { LOCKED } from "@/modules/quotes/schema";
import { addCatalogLine, getQuote, setComment } from "@/modules/quotes/service";
import { completeDraft, makeDraft } from "../helpers/quotes";

const bombas = { templateId: "kit-bomba", quantity: "2", params: { distancia: "10" }, choices: { main: "concept-bom-mayor75", c1: "concept-man-4x25" } };

/** A complete draft with a kit, and a comment on each kind of element. */
async function commented() {
  const d = await completeDraft();
  const kit = await addKitInstance(d.actor, d.sub.id, bombas);
  const q = await getQuote(d.quote.id);
  const sub = q.sections[0].children[0];
  const line = sub.lines.find((l) => !l.kitInstanceId)!;
  const kitLine = sub.lines.find((l) => l.kitSlot === "c1")!;
  await setComment(d.actor, { kind: "section", id: q.sections[0].id, comment: "De la partida" });
  await setComment(d.actor, { kind: "section", id: sub.id, comment: "De la subpartida" });
  await setComment(d.actor, { kind: "line", id: line.id, comment: "De la línea" });
  await setComment(d.actor, { kind: "kit", id: kit.id, comment: "Del conjunto" });
  await setComment(d.actor, { kind: "line", id: kitLine.id, comment: "De la manguera" });
  return { ...d, kit, lineId: line.id, kitLineId: kitLine.id };
}

/** The five comments of a quote, in a fixed order. */
async function commentsOf(quoteId: string) {
  const q = await getQuote(quoteId);
  const sub = q.sections[0].children[0];
  return [
    q.sections[0].comment, sub.comment,
    sub.lines.find((l) => !l.kitInstanceId && l.comment)?.comment, sub.kits[0].comment, sub.lines.find((l) => l.kitSlot === "c1")?.comment,
  ];
}

test("comentar una línea, un conjunto, una línea de conjunto, la subpartida y la partida los guarda", async () => {
  const { quote } = await commented();
  expect(await commentsOf(quote.id)).toEqual(["De la partida", "De la subpartida", "De la línea", "Del conjunto", "De la manguera"]);
  const log = await prisma.auditLog.findMany({ where: { entity: "quote", entityId: quote.id, summary: { startsWith: "Comentario" } } });
  expect(log).toHaveLength(5);
});

test("el comentario se guarda recortado y uno vacío o de espacios lo quita", async () => {
  const { actor, sub } = await makeDraft();
  await setComment(actor, { kind: "section", id: sub.id, comment: "  Ver plano  " });
  expect((await prisma.quoteSection.findUniqueOrThrow({ where: { id: sub.id } })).comment).toBe("Ver plano");
  await setComment(actor, { kind: "section", id: sub.id, comment: "   " });
  expect((await prisma.quoteSection.findUniqueOrThrow({ where: { id: sub.id } })).comment).toBe("");
});

test("un comentario de más de 2000 caracteres se rechaza", async () => {
  const { actor, sub } = await makeDraft();
  await expect(setComment(actor, { kind: "section", id: sub.id, comment: "x".repeat(2001) })).rejects.toThrow(ValidationError);
  await setComment(actor, { kind: "section", id: sub.id, comment: "x".repeat(2000) });
});

test("en un presupuesto emitido no se puede comentar", async () => {
  const { actor, quote, sub } = await completeDraft();
  const line = await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" });
  await issueQuote(actor, quote.id);
  await expect(setComment(actor, { kind: "line", id: line.id, comment: "Tarde" })).rejects.toThrow(LOCKED);
});

test("una id que no es de ese tipo de elemento da NotFound", async () => {
  const { actor, sub } = await makeDraft();
  const line = await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" });
  await expect(setComment(actor, { kind: "kit", id: line.id, comment: "x" })).rejects.toThrow(NotFoundError);
});

test("recalcular el conjunto conserva el comentario de la línea de su hueco, aunque cambie el concepto", async () => {
  const { actor, kit, kitLineId } = await commented();
  await updateKitInstance(actor, kit.id, { ...bombas, quantity: "3" });
  expect((await prisma.quoteLine.findUniqueOrThrow({ where: { id: kitLineId } })).comment).toBe("De la manguera");
  await updateKitInstance(actor, kit.id, { ...bombas, choices: { ...bombas.choices, c1: "concept-man-12x075" } });
  const line = await prisma.quoteLine.findFirstOrThrow({ where: { kitInstanceId: kit.id, kitSlot: "c1" } });
  expect([line.conceptId, line.comment]).toEqual(["concept-man-12x075", "De la manguera"]);
});

test("la revisión y el duplicado copian los comentarios", async () => {
  const { actor, quote } = await commented();
  await issueQuote(actor, quote.id);
  const expected = ["De la partida", "De la subpartida", "De la línea", "Del conjunto", "De la manguera"];
  const rev = await createRevision(actor, quote.id);
  expect(await commentsOf(rev.id)).toEqual(expected);
  const dup = await duplicateQuote(actor, quote.id);
  expect(await commentsOf(dup.quote.id)).toEqual(expected);
});

test("la instantánea emitida lleva los comentarios", async () => {
  const { actor, quote, lineId } = await commented();
  await issueQuote(actor, quote.id);
  const doc = await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: quote.id } });
  type Snap = { quote: { sections: { comment: string; children: { comment: string; lines: { id: string; comment: string }[]; kits: { comment: string }[] }[] }[] } };
  const s = (doc.snapshot as Snap).quote.sections[0];
  expect([s.comment, s.children[0].comment, s.children[0].lines.find((l) => l.id === lineId)?.comment, s.children[0].kits[0].comment])
    .toEqual(["De la partida", "De la subpartida", "De la línea", "Del conjunto"]);
});

test("editar el comentario en el borrador de la revisión no cambia la instantánea emitida", async () => {
  const { actor, quote, lineId } = await commented();
  await issueQuote(actor, quote.id);
  const before = (await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: quote.id } })).snapshot;
  const rev = await createRevision(actor, quote.id);
  const revLine = (await getQuote(rev.id)).sections[0].children[0].lines.find((l) => l.comment === "De la línea")!;
  await setComment(actor, { kind: "line", id: revLine.id, comment: "Cambiado en la R01" });
  const after = (await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: quote.id } })).snapshot;
  expect(after).toEqual(before);
  expect((await prisma.quoteLine.findUniqueOrThrow({ where: { id: lineId } })).comment).toBe("De la línea");
});

test("quitar un componente opcional del conjunto borra su línea y su comentario", async () => {
  const { actor, sub } = await makeDraft();
  await prisma.kitTemplate.create({
    data: {
      id: "kit-prueba-opcional", name: "Bomba con manguera opcional", active: true,
      definition: {
        main: { categoryId: "cat-bombas", label: "Bomba" }, params: [],
        components: [{ slot: "c1", label: "Manguera", ref: { categoryId: "cat-mangueras" }, required: false, formula: { type: "FIXED", k: "5" } }],
      },
    },
  });
  const input = { templateId: "kit-prueba-opcional", quantity: "1", params: {}, choices: { main: "concept-bom-mayor75", c1: "concept-man-4x25" } };
  const kit = await addKitInstance(actor, sub.id, input);
  const hose = await prisma.quoteLine.findFirstOrThrow({ where: { kitInstanceId: kit.id, kitSlot: "c1" } });
  await setComment(actor, { kind: "line", id: hose.id, comment: "Manguera a medida" });
  await updateKitInstance(actor, kit.id, { ...input, choices: { main: "concept-bom-mayor75" } });
  expect(await prisma.quoteLine.findUnique({ where: { id: hose.id } })).toBeNull();
  expect(await prisma.quoteLine.count({ where: { comment: "Manguera a medida" } })).toBe(0);
});
