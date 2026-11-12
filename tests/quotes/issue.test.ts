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
import { conceptFields, completeDraft, makeDraft } from "../helpers/quotes";
import { makeUser } from "../helpers/users";

const year = todayMadrid().getUTCFullYear(); // the issue year is Madrid's, as in issueQuote

test("formatReference con el patrón por defecto y otros anchos", () => {
  expect(formatReference("PR-{AAAA}{NNNNNN}-R{RR}", { year: 2026, seq: 1029, revision: 0 })).toBe("PR-2026001029-R00");
  expect(formatReference("OF/{AAAA}/{NNNN}-{RR}", { year: 2027, seq: 7, revision: 12 })).toBe("OF/2027/0007-12");
});

test("emitir asigna número, guarda la instantánea y bloquea la edición", async () => {
  const { actor, quote, sub } = await completeDraft();
  const q = await issueQuote(actor, quote.id);
  expect([q.status, q.reference, q.seq]).toEqual(["ISSUED", `PR-${year}000001-R00`, 1]);
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
  await updateSettings(admin, { numberStart: "1029", numberYearlyReset: "si", numberPattern: "P-{AAAA}-{NNNN}/{RR}" });
  const { actor, quote } = await completeDraft();
  expect((await issueQuote(actor, quote.id)).reference).toBe(`P-${year}-1029/00`);
  expect(await prisma.numberCounter.findUnique({ where: { key: String(year) } })).toMatchObject({ value: 1029 });
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
  await expect(updateSettings(admin, { numberYearlyReset: "si", numberPattern: "PR-{NNNNNN}-R{RR}" })).rejects.toThrow(ValidationError);
  await updateSettings(admin, { numberPattern: "PR-{NNNNNN}-R{RR}" });
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
  expect(problems.map((p) => p.code)).toEqual(["location", "paymentTerms", "required", "kit", "unvalidated"]);
  expect(problems.find((p) => p.code === "kit")?.anchor).toBe(`#conjunto-${kit.id}`);
  await expect(issueQuote(actor, quote.id)).rejects.toThrow(ValidationError);
});

test("subpartida global sin precio bloquea; vacío bloquea; renuncia con motivo deja emitir", async () => {
  const c = await completeDraft();
  await updateSection(c.actor, c.sub.id, { mode: "GLOBAL" });
  expect(issueChecks(await getQuote(c.quote.id), await listRequiredConcepts()).map((p) => p.code)).toEqual(["global"]);
  const e = await makeDraft({ clientOver: { paymentTerms: "Contado" } });
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
