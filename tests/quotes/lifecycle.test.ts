import { prisma } from "@/lib/db";
import { getConcept, setConceptActive, updateConcept } from "@/modules/catalog/service";
import { issueQuote } from "@/modules/quotes/issue";
import { createRevision, duplicateQuote, isExpired, listQuoteHistory, listQuotes, refreshPricesFromCatalog, setStatus } from "@/modules/quotes/lifecycle";
import { addCatalogLine, deleteDraft, getQuote, updateLine } from "@/modules/quotes/service";
import { conceptFields, completeDraft } from "../helpers/quotes";

test("revisar crea R01 en borrador; al emitirla, R00 queda sustituida y ya no cambia de estado", async () => {
  const { actor, quote } = await completeDraft();
  const r0 = await issueQuote(actor, quote.id);
  const r1 = await createRevision(actor, r0.id);
  expect([r1.status, r1.seq, r1.revision, r1.reference]).toEqual(["DRAFT", r0.seq, 1, null]);
  expect((await getQuote(r1.id)).total.toFixed(2)).toBe("1246.30");
  const issued = await issueQuote(actor, r1.id);
  expect(issued.reference).toBe(r0.reference!.replace("-R00", "-R01"));
  expect((await getQuote(r0.id)).supersededById).toBe(r1.id);
  await expect(setStatus(actor, r0.id, "SENT")).rejects.toThrow("Sustituido");
  await expect(createRevision(actor, r0.id)).rejects.toThrow("Sustituido");
});

test("no puede haber dos borradores de revisión; abandonar el borrador deja R00 vigente", async () => {
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  const r1 = await createRevision(actor, quote.id);
  await expect(createRevision(actor, quote.id)).rejects.toThrow("Ya hay un borrador de revisión R01");
  await deleteDraft(actor, r1.id);
  await setStatus(actor, quote.id, "SENT");
  expect((await getQuote(quote.id)).status).toBe("SENT");
  expect(await prisma.auditLog.count({ where: { entityId: quote.id, action: "status" } })).toBe(1);
});

test("un borrador no cambia de estado a mano", async () => {
  const { actor, quote } = await completeDraft();
  await expect(setStatus(actor, quote.id, "SENT")).rejects.toThrow();
});

test("duplicar avisa de conceptos con otro precio o inactivos y refrescar actualiza salvo los ajustados", async () => {
  const { actor, admin, quote, sub } = await completeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "1" });
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), salePrice: "12", validated: true });
  await setConceptActive(admin, "concept-ser-despl", false);
  const { quote: dup, warnings } = await duplicateQuote(actor, quote.id);
  expect(warnings).toEqual(["SER-DESPL: desactivado en el catálogo", "MAN-4X25: catálogo 12,00, presupuesto 10,00"]);
  expect([dup.status, dup.seq]).toEqual(["DRAFT", null]);
  expect(await refreshPricesFromCatalog(actor, dup.id)).toBe(1);
  expect((await getQuote(dup.id)).base.toFixed(2)).toBe("1042.00");
  expect((await getQuote(quote.id)).base.toFixed(2)).toBe("1040.00");
});

test("refrescar copia también el cambio de unidad o de nombre del impuesto aunque el precio no cambie", async () => {
  const { actor, admin, quote, sub } = await completeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "1" });
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), unitId: "unit-ud", salePrice: c.salePrice!.toString() });
  expect(await refreshPricesFromCatalog(actor, quote.id)).toBe(1);
  const line = (await getQuote(quote.id)).sections[0].children[0].lines.find((l) => l.conceptId === "concept-man-4x25")!;
  expect(line.unitName).toBe("ud");
});

test("el listado filtra por fechas y estado, cuenta por estado y suma solo la última revisión", async () => {
  const a = await completeDraft();
  await issueQuote(a.actor, a.quote.id);
  const r1 = await createRevision(a.actor, a.quote.id);
  const line = (await getQuote(r1.id)).sections[0].children[0].lines[1];
  await updateLine(a.actor, line.id, { quantity: "26" }); // 30 + 26 × 50 = 1330 → total 1609,30
  await issueQuote(a.actor, r1.id);
  await setStatus(a.actor, r1.id, "SENT");
  await completeDraft(); // un borrador de 1.246,30
  const all = await listQuotes({});
  expect([all.total, all.sum.toFixed(2)]).toEqual([2, "2855.60"]);
  expect([all.counts.SENT, all.counts.DRAFT]).toEqual([1, 1]);
  const sent = await listQuotes({ status: "SENT", from: "2000-01-01", to: "2999-12-31" });
  expect(sent.items.map((q) => q.id)).toEqual([r1.id]);
  expect((await listQuotes({ from: "2999-01-01" })).total).toBe(0);
  expect((await listQuoteHistory(r1.id)).length).toBeGreaterThan(3);
});

test("isExpired: emitido hace 31 días con validez 30 → caducado; aceptado nunca", () => {
  const issuedAt = new Date("2026-10-01T10:00:00Z");
  expect(isExpired({ status: "SENT", issuedAt, validityDays: 30 }, new Date("2026-11-01T10:00:00Z"))).toBe(true);
  expect(isExpired({ status: "SENT", issuedAt, validityDays: 30 }, new Date("2026-10-30T10:00:00Z"))).toBe(false);
  expect(isExpired({ status: "ACCEPTED", issuedAt, validityDays: 30 }, new Date("2027-01-01"))).toBe(false);
});

test("setStatus rechaza estados que no existen, aunque sean nombres heredados", async () => {
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  for (const bad of ["constructor", "toString", "DRAFT", "x"])
    await expect(setStatus(actor, quote.id, bad as never)).rejects.toThrow("Estado no válido");
});
