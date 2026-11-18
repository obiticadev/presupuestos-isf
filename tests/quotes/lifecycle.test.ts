import { prisma } from "@/lib/db";
import { getConcept, setConceptActive, updateConcept } from "@/modules/catalog/service";
import { issueQuote } from "@/modules/quotes/issue";
import { createExtension, createRevision, duplicateQuote, expireQuotes, validityRunOut, listQuoteHistory, listQuotes, listRevisions, refreshPricesFromCatalog, setStatus } from "@/modules/quotes/lifecycle";
import { addCatalogLine, adjustPrice, deleteDraft, getQuote, updateHeader, updateLine } from "@/modules/quotes/service";
import { ValidationError } from "@/lib/errors";
import { conceptFields, completeDraft, makeClient, quoteType } from "../helpers/quotes";

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

test("expireQuotes caduca al día siguiente del vencimiento, contando días de Madrid", async () => {
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  // 2026-03-01 23:30 en Madrid = 22:30 UTC; con 30 días vence el 31 de marzo.
  await prisma.quote.update({ where: { id: quote.id }, data: { issuedAt: new Date("2026-03-01T22:30:00Z"), validityDays: 30 } });
  await expireQuotes(new Date("2026-03-31T21:59:00Z")); // 31-03 23:59 en Madrid
  expect((await getQuote(quote.id)).status).toBe("ISSUED");
  expect(await expireQuotes(new Date("2026-03-31T22:01:00Z"))).toBeGreaterThanOrEqual(1); // 01-04 00:01 en Madrid
  expect((await getQuote(quote.id)).status).toBe("EXPIRED");
  const logs = await prisma.auditLog.findMany({ where: { entityId: quote.id, action: "status" } });
  expect(logs.map((l) => [l.userId, l.summary])).toEqual([[null, expect.stringMatching(/Emitido → Caducado \(validez vencida\)$/)]]);
  await expireQuotes(new Date("2026-04-02T10:00:00Z")); // idempotente: no hay segunda entrada
  expect(await prisma.auditLog.count({ where: { entityId: quote.id, action: "status" } })).toBe(1);
});

test("expireQuotes cuenta el día de emisión de Madrid aunque en UTC sea el día anterior", async () => {
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  // 2026-03-02 00:30 en Madrid = 2026-03-01 23:30 UTC: emitido el día 2; con 30 días vence el 1 de abril.
  await prisma.quote.update({ where: { id: quote.id }, data: { issuedAt: new Date("2026-03-01T23:30:00Z"), validityDays: 30 } });
  await expireQuotes(new Date("2026-03-31T22:30:00Z")); // 01-04 00:30 en Madrid: aún vigente
  expect((await getQuote(quote.id)).status).toBe("ISSUED");
  await expireQuotes(new Date("2026-04-01T22:30:00Z")); // 02-04 00:30 en Madrid
  expect((await getQuote(quote.id)).status).toBe("EXPIRED");
});

test("con la validez vencida no se vuelve a Emitido ni Enviado a mano (la tarea lo caducaría); sí a Aceptado o Rechazado", async () => {
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  await prisma.quote.update({ where: { id: quote.id }, data: { issuedAt: new Date("2020-01-01T10:00:00Z"), validityDays: 30 } });
  await expireQuotes();
  await expect(setStatus(actor, quote.id, "SENT")).rejects.toThrow("La validez ya venció");
  await expect(setStatus(actor, quote.id, "ISSUED")).rejects.toThrow("La validez ya venció");
  await setStatus(actor, quote.id, "ACCEPTED");
  await expect(setStatus(actor, quote.id, "SENT")).rejects.toThrow("La validez ya venció");
  expect(validityRunOut((await getQuote(quote.id)))).toBe(true);
  const { actor: a2, quote: fresh } = await completeDraft();
  await issueQuote(a2, fresh.id);
  await setStatus(a2, fresh.id, "SENT"); // vigente: sin cambios
  expect(validityRunOut(await getQuote(fresh.id))).toBe(false);
});

test("expireQuotes no toca aceptados, rechazados, borradores ni revisiones sustituidas; sí los enviados", async () => {
  const old = { issuedAt: new Date("2020-01-01T10:00:00Z"), validityDays: 1 };
  const issued = async (status?: "ACCEPTED" | "REJECTED" | "SENT") => {
    const { actor, quote } = await completeDraft();
    await issueQuote(actor, quote.id);
    await prisma.quote.update({ where: { id: quote.id }, data: { ...old, ...(status && { status }) } });
    return { actor, id: quote.id };
  };
  const accepted = await issued("ACCEPTED"), rejected = await issued("REJECTED"), sent = await issued("SENT");
  const replaced = await issued();
  const r1 = await createRevision(replaced.actor, replaced.id);
  await issueQuote(replaced.actor, r1.id);
  await prisma.quote.update({ where: { id: r1.id }, data: { status: "ACCEPTED" } });
  const { quote: draft } = await completeDraft();
  await prisma.quote.update({ where: { id: draft.id }, data: old });
  await expireQuotes();
  const status = async (id: string) => (await getQuote(id)).status;
  expect([await status(accepted.id), await status(rejected.id), await status(sent.id), await status(replaced.id), await status(draft.id)])
    .toEqual(["ACCEPTED", "REJECTED", "EXPIRED", "ISSUED", "DRAFT"]);
});

test("setStatus rechaza estados que no existen, aunque sean nombres heredados", async () => {
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  for (const bad of ["constructor", "toString", "DRAFT", "x"])
    await expect(setStatus(actor, quote.id, bad as never)).rejects.toThrow("Estado no válido");
});

test("el responsable es quien emite: la revisión la lleva quien la abre y, al emitirla, quien la emite", async () => {
  const { actor, admin, quote } = await completeDraft();
  expect((await issueQuote(admin, quote.id)).ownerId).toBe(admin.id);
  const r1 = await createRevision(actor, quote.id);
  expect(r1.ownerId).toBe(actor.id);
  expect((await issueQuote(admin, r1.id)).ownerId).toBe(admin.id);
  expect((await getQuote(quote.id)).ownerId).toBe(admin.id); // la anterior conserva su responsable
});

test("listRevisions da todas las revisiones del número, de la más reciente a la primera", async () => {
  const { actor, quote } = await completeDraft();
  expect(await listRevisions(quote.id)).toEqual([]); // sin número aún
  await issueQuote(actor, quote.id);
  const r1 = await createRevision(actor, quote.id);
  const revs = await listRevisions(r1.id);
  expect(revs.map((r) => [r.id, r.revision, r.status])).toEqual([[r1.id, 1, "DRAFT"], [quote.id, 0, "ISSUED"]]);
});

test("una revisión sale con los precios del catálogo al día; la emitida conserva los suyos", async () => {
  const { actor, admin, quote, sub } = await completeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "1" });
  await issueQuote(actor, quote.id);
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), salePrice: "12", validated: true });
  const rev = await createRevision(actor, quote.id);
  expect(rev.refreshed).toBe(1);
  expect((await getQuote(rev.id)).base.toFixed(2)).toBe("1042.00");
  expect((await getQuote(quote.id)).base.toFixed(2)).toBe("1040.00");
  expect((await listQuoteHistory(rev.id)).map((e) => e.summary)).toContain(`Revisión de ${(await getQuote(quote.id)).reference}; 1 línea con precios del catálogo`);
});

test("la revisión respeta los precios ajustados a mano", async () => {
  const { actor, admin, quote, sub } = await completeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "1" });
  const line = (await getQuote(quote.id)).sections[0].children[0].lines.find((l) => l.conceptId === "concept-man-4x25")!;
  await adjustPrice(actor, line.id, { newPrice: "11", reason: "Acordado" });
  await issueQuote(actor, quote.id);
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), salePrice: "12", validated: true });
  const rev = await createRevision(actor, quote.id);
  expect(rev.refreshed).toBe(0);
  expect((await listQuoteHistory(rev.id)).map((e) => e.summary)).toContain(`Revisión de ${(await getQuote(quote.id)).reference}`);
});

test("las revisiones de un número no mezclan tipos con el mismo número", async () => {
  const t2 = await quoteType(2);
  const a = await completeDraft();
  const b = await completeDraft();
  await prisma.quote.update({ where: { id: b.quote.id }, data: { typeId: t2.id } });
  await issueQuote(a.actor, a.quote.id);
  await issueQuote(b.actor, b.quote.id);
  expect((await listRevisions(a.quote.id)).map((r) => r.id)).toEqual([a.quote.id]);
  expect((await listQuoteHistory(a.quote.id)).every((h) => h.entityId === a.quote.id)).toBe(true);
});

test("duplicar copia el tipo", async () => {
  const { actor, quote } = await completeDraft();
  const { quote: dup } = await duplicateQuote(actor, quote.id);
  expect(dup.typeId).toBe((await getQuote(quote.id)).typeId);
});

const year = new Date().getUTCFullYear();

test("ampliar la principal emitida crea A01-R00 sin partidas ni notas y con la cabecera copiada", async () => {
  const { actor, quote } = await completeDraft();
  const r0 = await issueQuote(actor, quote.id);
  const a1 = await createExtension(actor, r0.id);
  expect([a1.status, a1.extension, a1.revision, a1.seq, a1.typeCode]).toEqual(["DRAFT", 1, 0, r0.seq, 1]);
  expect([a1.subject, a1.paymentTerms]).toEqual([r0.subject, r0.paymentTerms]);
  const d = await getQuote(a1.id);
  expect(d.sections.flatMap((s) => s.children.flatMap((c) => c.lines))).toEqual([]);
  expect(d.total.toFixed(2)).toBe("0.00");
  expect(await prisma.quoteNote.count({ where: { quoteId: a1.id } })).toBe(0);
  await addCatalogLine(actor, d.sections[0].children[0].id, { conceptId: "concept-ser-despl", quantity: "100" });
  await addCatalogLine(actor, d.sections[0].children[0].id, { conceptId: "concept-ser-prog", quantity: "1" });
  expect((await issueQuote(actor, a1.id)).reference).toBe(r0.reference!.replace("-R00", "-A01-R00"));
  expect((await getQuote(r0.id)).supersededById).toBeNull();
  expect((await createExtension(actor, r0.id)).extension).toBe(2);
});

/** Main R00 issued and A01-R00 issued; returns both. */
async function withExtension() {
  const d = await completeDraft();
  const r0 = await issueQuote(d.actor, d.quote.id);
  const a1 = await createExtension(d.actor, r0.id);
  const sub = (await getQuote(a1.id)).sections[0].children[0];
  await addCatalogLine(d.actor, sub.id, { conceptId: "concept-ser-despl", quantity: "100" });
  await addCatalogLine(d.actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" });
  return { ...d, r0, a1: await issueQuote(d.actor, a1.id) };
}

test("la revisión de la A01 es A01-R01 y sustituye a la A01-R00, no a la principal", async () => {
  const { actor, r0, a1 } = await withExtension();
  const r = await createRevision(actor, a1.id);
  expect((await issueQuote(actor, r.id)).reference).toBe(r0.reference!.replace("-R00", "-A01-R01"));
  expect((await getQuote(a1.id)).supersededById).toBe(r.id);
  expect((await getQuote(r0.id)).supersededById).toBeNull();
});

test("reglas de las ampliaciones", async () => {
  const { actor, quote, r0, a1 } = await withExtension();
  const draft = await completeDraft();
  await expect(createExtension(actor, draft.quote.id)).rejects.toThrow(ValidationError);
  await expect(createExtension(actor, a1.id)).rejects.toThrow("Solo se amplía la principal");
  await expect(createRevision(actor, r0.id)).rejects.toThrow("Ya tiene una ampliación posterior: solo avanza la más reciente");
  const pending = await createRevision(actor, a1.id);
  await expect(createExtension(actor, quote.id)).rejects.toThrow("Hay un borrador pendiente en este presupuesto: emítelo o bórralo antes");
  await deleteDraft(actor, pending.id);
  await createExtension(actor, quote.id);
  await expect(createRevision(actor, a1.id)).rejects.toThrow("Ya tiene una ampliación posterior: solo avanza la más reciente");
});

test("una revisión sustituida no se amplía", async () => {
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  const r1 = await createRevision(actor, quote.id);
  await issueQuote(actor, r1.id);
  await expect(createExtension(actor, quote.id)).rejects.toThrow("Sustituido");
});

test("en una ampliación no se cambian tipo, cliente ni instalación; el resto, sí", async () => {
  const { actor, admin, r0 } = await (async () => { const d = await completeDraft(); return { ...d, r0: await issueQuote(d.actor, d.quote.id) }; })();
  const a1 = await createExtension(actor, r0.id);
  const other = await makeClient(admin);
  const msg = { issues: { _: "En una ampliación no se cambian tipo, cliente ni instalación" } };
  await expect(updateHeader(actor, a1.id, { clientId: other.client.id })).rejects.toMatchObject(msg);
  await expect(updateHeader(actor, a1.id, { locationId: "" })).rejects.toMatchObject(msg);
  await expect(updateHeader(actor, a1.id, { typeId: (await quoteType(2)).id })).rejects.toMatchObject(msg);
  await updateHeader(actor, a1.id, { clientId: r0.clientId, locationId: r0.locationId!, subject: "otra cosa", validityDays: "15", paymentTerms: "Contado", exclusions: "Nada", date: `${year}-01-02` });
  expect((await getQuote(a1.id)).subject).toBe("otra cosa");
});

test("el listado trae una fila por línea viva y el historial de la A01 incluye el de la principal", async () => {
  const { actor, quote, r0, a1 } = await withExtension();
  const r1 = await createRevision(actor, r0.id).catch(() => null); // blocked: the main line no longer moves
  expect(r1).toBeNull();
  const ids = (await listQuotes({})).items.map((i) => i.id);
  expect(ids).toEqual(expect.arrayContaining([r0.id, a1.id]));
  expect((await listQuoteHistory(a1.id)).some((h) => h.entityId === quote.id)).toBe(true);
  expect((await listRevisions(a1.id)).map((r) => [r.extension, r.revision])).toEqual([[1, 0], [0, 0]]);
});

test("nueva ampliación y revisión de la A01 a la vez: solo una sale adelante", async () => {
  for (let i = 0; i < 5; i++) {
    const { actor, r0, a1 } = await withExtension();
    const results = await Promise.allSettled([createExtension(actor, r0.id), createRevision(actor, a1.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  }
});
