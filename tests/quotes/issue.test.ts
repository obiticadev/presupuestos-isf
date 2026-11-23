import { prisma } from "@/lib/db";
import { todayMadrid } from "@/lib/dates";
import { ValidationError } from "@/lib/errors";
import { getConcept, setConceptActive, updateConcept } from "@/modules/catalog/service";
import { updateSettings } from "@/modules/settings/service";
import { addKitInstance } from "@/modules/quotes/kit-instances";
import { issueChecks, issueQuote } from "@/modules/quotes/issue";
import { formatReference } from "@/modules/quotes/numbering";
import {
  addCatalogLine, addRequiredConcept, getQuote, listRequiredConcepts, removeRequiredConcept, setWaiver, updateHeader, updateSection,
} from "@/modules/quotes/service";
import { conceptFields, completeDraft, makeDraft, quoteType } from "../helpers/quotes";
import { makeUser, TEST_SIGNATURE } from "../helpers/users";
import { saveSignature } from "@/modules/account/service";
import { createRevision } from "@/modules/quotes/lifecycle";

const year = todayMadrid().getUTCFullYear(); // the issue year is Madrid's, as in issueQuote

test("formatReference con el patrón por defecto y otros anchos", () => {
  expect(formatReference("PR-{AAAA}{NNNNNN}-R{RR}", { year: 2026, typeCode: 0, seq: 1029, extension: 0, revision: 0 })).toBe("PR-2026001029-R00");
  expect(formatReference("OF/{AAAA}/{NNNN}-{RR}", { year: 2027, typeCode: 0, seq: 7, extension: 0, revision: 12 })).toBe("OF/2027/0007-12");
});

test("emitir asigna número, guarda la instantánea y bloquea la edición", async () => {
  const { actor, quote, sub } = await completeDraft();
  const q = await issueQuote(actor, quote.id);
  expect([q.status, q.reference, q.seq]).toEqual(["ISSUED", `PR-${year}001001-R00`, 1]);
  const doc = await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: quote.id } });
  const snap = doc.snapshot as { quote: { total: string }; company: { legalName: string } };
  expect([snap.quote.total, doc.templateVersion, doc.pdfPath]).toEqual(["1246.3", "v1", null]);
  await expect(addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" })).rejects.toThrow("ya está emitido");
  await expect(issueQuote(actor, quote.id)).rejects.toThrow("ya está emitido");
});

test("dos emisiones simultáneas dan números consecutivos distintos", async () => {
  const a = await completeDraft();
  const b = await completeDraft();
  const r = await Promise.all([issueQuote(a.actor, a.quote.id), issueQuote(b.actor, b.quote.id)]);
  expect(r.map((q) => q.seq).sort()).toEqual([1, 2]);
});

test("valor inicial, patrón y reinicio anual configurables; un patrón sin número se rechaza", async () => {
  const admin = await makeUser("admin");
  await expect(updateSettings(admin, { numberPattern: "PR-{AAAA}" })).rejects.toThrow(ValidationError);
  await updateSettings(admin, { numberStart: "1029", numberYearlyReset: "si", numberPattern: "P-{AAAA}-{TTT}-{NNNN}/{RR}" });
  const { actor, quote } = await completeDraft();
  expect((await issueQuote(actor, quote.id)).reference).toBe(`P-${year}-001-1029/00`);
  expect(await prisma.numberCounter.findUnique({ where: { key: `${year}-001` } })).toMatchObject({ value: 1029 });
});

test("cambiar el reinicio anual con presupuestos ya emitidos no repite números ni bloquea la emisión", async () => {
  const admin = await makeUser("admin");
  const issue = async () => { const { actor, quote } = await completeDraft(); return (await issueQuote(actor, quote.id)).seq; };
  expect(await issue()).toBe(1);
  await updateSettings(admin, { numberYearlyReset: "si" });
  expect(await issue()).toBe(2); // the year's new counter starts after what was already issued that year
  await updateSettings(admin, { numberYearlyReset: "no" });
  expect(await issue()).toBe(3); // and the stale global counter catches up too
});

test("el reinicio anual exige el año en el patrón", async () => {
  const admin = await makeUser("admin");
  await expect(updateSettings(admin, { numberYearlyReset: "si", numberPattern: "PR-{TTT}{NNNNNN}-R{RR}" })).rejects.toThrow(ValidationError);
  await updateSettings(admin, { numberPattern: "PR-{TTT}{NNNNNN}-R{RR}" });
  await expect(updateSettings(admin, { numberYearlyReset: "si" })).rejects.toThrow(ValidationError);
});

test("una ubicación desactivada después de elegirla impide emitir", async () => {
  const { quote, location } = await completeDraft();
  await prisma.clientLocation.update({ where: { id: location.id }, data: { active: false } });
  expect(issueChecks(await getQuote(quote.id), await listRequiredConcepts()).map((p) => p.code)).toEqual(["location"]);
});

test("un concepto obligatorio desactivado deja de exigirse", async () => {
  const admin = await makeUser("admin");
  const { quote } = await makeDraft();
  await setConceptActive(admin, "concept-ser-prog", false);
  const codes = issueChecks(await getQuote(quote.id), await listRequiredConcepts()).filter((p) => p.code === "required").map((p) => p.message);
  expect(codes).toEqual(["Falta Desplazamiento (o márcalo a 0 con motivo)"]);
});

test("issueChecks lista cada problema con su ancla y no deja emitir", async () => {
  const { actor, quote, sub } = await makeDraft();
  await updateHeader(actor, quote.id, { locationId: "" });
  await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-despl", quantity: "100" });
  const kit = await addKitInstance(actor, sub.id, { templateId: "kit-bomba", quantity: "1", params: {}, choices: {} });
  const problems = issueChecks(await getQuote(quote.id), await listRequiredConcepts());
  expect(problems.map((p) => p.code)).toEqual(["type", "location", "subject", "paymentTerms", "required", "kit", "unvalidated"]);
  expect(problems.find((p) => p.code === "kit")?.anchor).toBe(`#conjunto-${kit.id}`);
  await expect(issueQuote(actor, quote.id)).rejects.toThrow(ValidationError);
});

test("subpartida global sin precio bloquea; vacío bloquea; renuncia con motivo deja emitir", async () => {
  const c = await completeDraft();
  await updateSection(c.actor, c.sub.id, { mode: "GLOBAL" });
  expect(issueChecks(await getQuote(c.quote.id), await listRequiredConcepts()).map((p) => p.code)).toEqual(["global"]);
  const e = await makeDraft({ clientOver: { paymentTerms: "Contado" } });
  await updateHeader(e.actor, e.quote.id, { subject: "revisión de bombas" });
  await setWaiver(e.actor, e.quote.id, "concept-ser-despl", "En taller");
  await setWaiver(e.actor, e.quote.id, "concept-ser-prog", "Sin programación");
  expect(issueChecks(await getQuote(e.quote.id), await listRequiredConcepts()).map((p) => p.code)).toEqual(["empty"]);
  await prisma.concept.updateMany({ data: { validated: true } });
  await addCatalogLine(e.actor, e.sub.id, { conceptId: "concept-man-4x25", quantity: "2" });
  expect((await issueQuote(e.actor, e.quote.id)).status).toBe("ISSUED");
});

test("validar el concepto después hace desaparecer el aviso: se mira el estado actual", async () => {
  const { actor, admin, quote, sub } = await completeDraft();
  await prisma.concept.update({ where: { id: "concept-man-4x25" }, data: { validated: false } });
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "3" });
  expect(issueChecks(await getQuote(quote.id), await listRequiredConcepts()).map((p) => p.code)).toEqual(["unvalidated"]);
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), salePrice: "10", validated: true });
  expect(issueChecks(await getQuote(quote.id), await listRequiredConcepts())).toEqual([]);
});

test("los obligatorios se configuran; solo admin", async () => {
  const admin = await makeUser("admin");
  const p = await makeUser("presupuestador");
  await removeRequiredConcept(admin, "concept-ser-despl");
  await addRequiredConcept(admin, "concept-man-4x25");
  expect((await listRequiredConcepts()).map((r) => r.conceptId)).toEqual(["concept-man-4x25", "concept-ser-prog"]);
  await expect(addRequiredConcept(p, "concept-ser-despl")).rejects.toThrow("permiso");
});

test("los avisos de «Para emitir» hablan de la instalación", async () => {
  const { quote, location } = await completeDraft();
  await prisma.clientLocation.update({ where: { id: location.id }, data: { active: false } });
  expect(issueChecks(await getQuote(quote.id), await listRequiredConcepts()).find((p) => p.code === "location")?.message)
    .toBe("La instalación ya no está activa en el cliente: elige otra");
  const { actor, quote: other } = await makeDraft();
  await updateHeader(actor, other.id, { locationId: "" });
  expect(issueChecks(await getQuote(other.id), await listRequiredConcepts()).find((p) => p.code === "location")?.message).toBe("Falta la instalación");
});

test("sin asunto no se puede emitir", async () => {
  const { actor, quote } = await completeDraft();
  await updateHeader(actor, quote.id, { subject: "   " });
  const problems = issueChecks(await getQuote(quote.id), await listRequiredConcepts());
  expect(problems).toEqual([{ code: "subject", message: "Falta el asunto", anchor: "#cabecera" }]);
});

test("sin firma no se emite, aunque se llame directamente al servidor", async () => {
  const { quote } = await completeDraft();
  const unsigned = await makeUser("presupuestador", { signature: false });
  await expect(issueQuote(unsigned, quote.id)).rejects.toThrow("Falta tu firma");
  expect((await getQuote(quote.id)).status).toBe("DRAFT");
  const signature = issueChecks(await getQuote(quote.id), await listRequiredConcepts(), false).find((p) => p.code === "signature");
  expect(signature).toEqual({ code: "signature", message: "Falta tu firma: configúrala en Mi cuenta", anchor: "/cuenta" });
});

test("la instantánea guarda la firma y el nombre de quien emite; una revisión, los de quien la emite", async () => {
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  const signer = async (id: string) => ((await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: id } })).snapshot as { signer: unknown }).signer;
  expect(await signer(quote.id)).toEqual({ name: actor.name, signature: Buffer.from(TEST_SIGNATURE).toString("base64") });

  const other = await makeUser("presupuestador");
  const otherPng = Buffer.from(TEST_SIGNATURE);
  otherPng[otherPng.length - 20] ^= 1; // distinta de la del primero (el contenido no se valida más allá de la cabecera)
  await saveSignature(other, otherPng);
  const r1 = await createRevision(other, quote.id);
  await issueQuote(other, r1.id);
  expect(await signer(r1.id)).toEqual({ name: other.name, signature: otherPng.toString("base64") });
  expect(await signer(quote.id)).toEqual({ name: actor.name, signature: Buffer.from(TEST_SIGNATURE).toString("base64") });
});

test("cada tipo tiene su contador", async () => {
  const t2 = await quoteType(2, "Asistencia");
  const a = await completeDraft();
  const b = await completeDraft();
  await prisma.quote.update({ where: { id: b.quote.id }, data: { typeId: t2.id } });
  const c = await completeDraft();
  const [ra, rb] = [await issueQuote(a.actor, a.quote.id), await issueQuote(b.actor, b.quote.id)];
  expect([ra.seq, rb.seq]).toEqual([1, 1]);
  expect([ra.reference, rb.reference]).toEqual([`PR-${year}001001-R00`, `PR-${year}002001-R00`]);
  expect((await issueQuote(c.actor, c.quote.id)).seq).toBe(2);
});

test("el contador no pasa de 999: no se gasta número y el borrador sigue sin él", async () => {
  const admin = await makeUser("admin");
  await updateSettings(admin, { numberStart: "999" });
  const a = await completeDraft();
  expect((await issueQuote(a.actor, a.quote.id)).reference).toBe(`PR-${year}001999-R00`);
  const b = await completeDraft();
  await expect(issueQuote(b.actor, b.quote.id)).rejects.toThrow("El contador del tipo 001 (Proyectos) ya llegó al 999: no quedan números");
  expect((await getQuote(b.quote.id)).seq).toBeNull();
  expect(await prisma.numberCounter.findUnique({ where: { key: "global-001" } })).toMatchObject({ value: 999 });
});

test("sin tipo no se emite; con el tipo desactivado, tampoco", async () => {
  const { quote } = await completeDraft();
  await prisma.quote.update({ where: { id: quote.id }, data: { typeId: null } });
  expect(issueChecks(await getQuote(quote.id), await listRequiredConcepts())).toEqual([{ code: "type", message: "Falta el tipo", anchor: "#cabecera" }]);
  const t = await quoteType(1);
  await prisma.quote.update({ where: { id: quote.id }, data: { typeId: t.id } });
  await prisma.quoteType.update({ where: { id: t.id }, data: { active: false } });
  expect(issueChecks(await getQuote(quote.id), await listRequiredConcepts()).map((p) => p.message)).toEqual(["El tipo está desactivado: elige otro"]);
});

test("cambiar el patrón después de emitir no cambia la forma de la revisión", async () => {
  const admin = await makeUser("admin");
  const { actor, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  await updateSettings(admin, { numberPattern: "X-{AAAA}{TTT}{NNNN}-R{RR}" });
  const r1 = await createRevision(actor, quote.id);
  expect((await issueQuote(actor, r1.id)).reference).toBe(`PR-${year}001001-R01`);
});

test("la revisión de un presupuesto antiguo, sin tipo, sale con su formato de siempre", async () => {
  const { actor, quote } = await completeDraft();
  await prisma.quote.update({
    where: { id: quote.id },
    data: { typeId: null, status: "ISSUED", issuedAt: new Date(), seqYear: year, seq: 5, typeCode: 0, numberPattern: "PR-{AAAA}{NNNNNN}-R{RR}", reference: `PR-${year}000005-R00` },
  });
  const r1 = await createRevision(actor, quote.id);
  expect(issueChecks(await getQuote(r1.id), await listRequiredConcepts())).toEqual([]);
  expect((await issueQuote(actor, r1.id)).reference).toBe(`PR-${year}000005-R01`);
});
