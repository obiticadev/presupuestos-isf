import { addKitInstance } from "@/modules/quotes/kit-instances";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { getConcept, removeConcept, setConceptActive, updateConcept } from "@/modules/catalog/service";
import { removeClient, removeLocation, setClientActive, updateClient } from "@/modules/clients/service";
import { updateSettings } from "@/modules/settings/service";
import {
  addCatalogLine, addCustomLine, addSection, createDraft, deleteDraft, getQuote, listRequiredConcepts,
  moveSection, removeLine, removeSection, setWaiver, updateHeader, updateLine, updateSection,
} from "@/modules/quotes/service";
import { conceptFields, makeClient, makeDraft, quoteType } from "../helpers/quotes";
import { makeUser } from "../helpers/users";

test("un borrador nuevo copia las condiciones del cliente y trae la partida 1 con la 1.1", async () => {
  const { quote, section, sub, actor, location, contact } = await makeDraft({ clientOver: { paymentTerms: "30 días", offerValidityDays: "45" } });
  expect([quote.status, quote.paymentTerms, quote.validityDays, quote.ownerId]).toEqual(["DRAFT", "30 días", 45, actor.id]);
  expect([quote.locationId, quote.contactId]).toEqual([location.id, contact.id]); // único: se preselecciona
  expect(section.parentId).toBeNull();
  expect(sub.parentId).toBe(section.id);
});

test("sin condiciones en el cliente se usan las de la configuración", async () => {
  const admin = await makeUser("admin");
  await updateSettings(admin, { defaultPaymentTerms: "Transferencia a 60 días" });
  const { client } = await makeClient(admin);
  const q = await createDraft(admin, { clientId: client.id });
  expect([q.paymentTerms, q.validityDays]).toEqual(["Transferencia a 60 días", 30]);
});

test("no se puede crear un presupuesto para un cliente desactivado", async () => {
  const admin = await makeUser("admin");
  const { client } = await makeClient(admin);
  await setClientActive(admin, client.id, false);
  await expect(createDraft(admin, { clientId: client.id })).rejects.toThrow(ValidationError);
});

test("añadir una línea del catálogo copia el precio; cambiar el catálogo después no la altera", async () => {
  const { actor, admin, quote, sub } = await makeDraft();
  const line = await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "30" });
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), salePrice: "99" });
  expect(line.unitPrice?.toFixed(2)).toBe("10.00");
  expect([line.description, line.unitName, line.taxName]).toEqual(["Manguera 4 hilos x 2,5 mm²", "m", "IVA 21 %"]);
  const q = await getQuote(quote.id);
  expect(q.totals.base.toFixed(2)).toBe("300.00");
  expect([q.base.toFixed(2), q.total.toFixed(2)]).toEqual(["300.00", "363.00"]);
});

test("ejemplo de la spec: 100 km + 20 h + 30 m da un total de 1.609,30", async () => {
  const { actor, quote, sub } = await makeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-despl", quantity: "100" });
  await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "20" });
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "30" });
  expect((await getQuote(quote.id)).total.toFixed(2)).toBe("1609.30");
});

test("cantidades a la española: «1,5» y «1.234,5» valen; «1.500» es ambiguo", async () => {
  const { actor, sub } = await makeDraft();
  expect((await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1,5" })).quantity.toFixed(4)).toBe("1.5000");
  expect((await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1.234,5" })).quantity.toFixed(1)).toBe("1234.5");
  await expect(addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1.500" })).rejects.toThrow("ambiguo");
  await expect(addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "-1" })).rejects.toThrow(ValidationError);
});

test("no se puede añadir un concepto inactivo ni uno sin precio a una subpartida por suma", async () => {
  const { actor, admin, sub } = await makeDraft();
  await setConceptActive(admin, "concept-ser-prog", false);
  await expect(addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" })).rejects.toThrow(ValidationError);
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...conceptFields(c), salePrice: "" });
  await expect(addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "1" })).rejects.toThrow("precio de venta");
});

test("en una subpartida de precio global las líneas son descriptivas y suma su propio precio", async () => {
  const { actor, quote, sub } = await makeDraft();
  await updateSection(actor, sub.id, { title: "Cuadro", mode: "GLOBAL", globalQty: "1", globalPrice: "15.845,22", taxId: "iva-21" });
  const line = await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "4" });
  expect([line.unitPrice, line.taxName]).toEqual([null, null]);
  const q = await getQuote(quote.id);
  expect([q.base.toFixed(2), q.totals.unpricedLineIds]).toEqual(["15845.22", []]);
});

test("una línea específica con su propio impuesto entra en el total", async () => {
  const { actor, quote, sub } = await makeDraft();
  await addCustomLine(actor, sub.id, { description: "Soporte a medida", unitName: "ud", quantity: "2", unitPrice: "25", taxId: "iva-21" });
  expect((await getQuote(quote.id)).total.toFixed(2)).toBe("60.50");
});

test("partidas y subpartidas: añadir, mover, renombrar y quitar recalcula", async () => {
  const { actor, quote, sub } = await makeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "2" });
  const p2 = await addSection(actor, quote.id, { title: "Partida B" });
  await moveSection(actor, p2.id, -1);
  let q = await getQuote(quote.id);
  expect(q.sections.map((s) => s.title)).toEqual(["Partida B", ""]);
  expect(q.sections[0].children).toHaveLength(1); // una partida nueva trae su subpartida
  await removeSection(actor, q.sections[1].id);
  q = await getQuote(quote.id);
  expect([q.sections.length, q.base.toFixed(2)]).toEqual([1, "0.00"]);
});

test("editar y quitar líneas; ocultar no cambia el total", async () => {
  const { actor, quote, sub } = await makeDraft();
  const l = await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "2" });
  await updateLine(actor, l.id, { quantity: "3", visible: false, description: "Programación PLC" });
  let q = await getQuote(quote.id);
  expect([q.base.toFixed(2), q.sections[0].children[0].lines[0].visible]).toEqual(["150.00", false]);
  await removeLine(actor, l.id);
  q = await getQuote(quote.id);
  expect(q.base.toFixed(2)).toBe("0.00");
});

test("eliminar un concepto usado en un presupuesto lo desactiva", async () => {
  const { actor, admin, sub } = await makeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-man-12x075", quantity: "1" });
  expect((await removeConcept(admin, "concept-man-12x075")).outcome).toBe("deactivated");
});

test("eliminar un cliente con presupuestos lo desactiva, igual que su ubicación usada", async () => {
  const { actor, client, location } = await makeDraft();
  expect(await removeLocation(actor, location.id)).toBe("deactivated");
  expect(await removeClient(actor, client.id)).toBe("deactivated");
});

test("un presupuesto emitido no se puede modificar", async () => {
  const { actor, quote, sub } = await makeDraft();
  await prisma.quote.update({ where: { id: quote.id }, data: { status: "ISSUED" } });
  await expect(addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" })).rejects.toThrow("ya está emitido");
  await expect(updateHeader(actor, quote.id, { subject: "x" })).rejects.toThrow("ya está emitido");
  await expect(deleteDraft(actor, quote.id)).rejects.toThrow("ya está emitido");
  expect((await getQuote(quote.id)).subject).toBe("");
});

test("cabecera: una ubicación de otro cliente se rechaza; cambiar de cliente limpia ubicación y contacto", async () => {
  const { actor, quote } = await makeDraft();
  const other = await makeClient(actor);
  await expect(updateHeader(actor, quote.id, { locationId: other.location.id })).rejects.toThrow(ValidationError);
  await updateHeader(actor, quote.id, { clientId: other.client.id, subject: "Grupo de bombeo", date: "2026-10-20" });
  const q = await getQuote(quote.id);
  expect([q.clientId, q.locationId, q.contactId, q.subject, q.date.toISOString().slice(0, 10)]).toEqual([other.client.id, null, null, "Grupo de bombeo", "2026-10-20"]);
});

test("cabecera: cambiar de cliente con el formulario completo descarta la ubicación y el contacto del anterior", async () => {
  const { actor, quote, location, contact } = await makeDraft();
  expect([(await getQuote(quote.id)).locationId, (await getQuote(quote.id)).contactId]).toEqual([location.id, contact.id]);
  const other = await makeClient(actor);
  // The form sends every header field, so the old client's location and contact arrive along with the new client.
  await updateHeader(actor, quote.id, { clientId: other.client.id, locationId: location.id, contactId: contact.id });
  const q = await getQuote(quote.id);
  expect([q.clientId, q.locationId, q.contactId]).toEqual([other.client.id, null, null]);
  // Choosing the new client's own location and contact in the same save keeps them.
  const third = await makeClient(actor);
  await updateHeader(actor, quote.id, { clientId: third.client.id, locationId: third.location.id, contactId: third.contact.id });
  const r = await getQuote(quote.id);
  expect([r.clientId, r.locationId, r.contactId]).toEqual([third.client.id, third.location.id, third.contact.id]);
});

test("conceptos obligatorios: la semilla trae desplazamiento y horas; la renuncia exige motivo", async () => {
  const { actor, quote } = await makeDraft();
  expect((await listRequiredConcepts()).map((r) => r.conceptId)).toEqual(["concept-ser-despl", "concept-ser-prog"]);
  await expect(setWaiver(actor, quote.id, "concept-ser-despl", "  ")).rejects.toThrow(ValidationError);
  await setWaiver(actor, quote.id, "concept-ser-despl", "Trabajo en nuestro taller");
  expect((await getQuote(quote.id)).waivers).toEqual({ "concept-ser-despl": "Trabajo en nuestro taller" });
  await setWaiver(actor, quote.id, "concept-ser-despl", null);
  expect((await getQuote(quote.id)).waivers).toEqual({});
});

test("borrar un borrador lo elimina y queda en el historial", async () => {
  const { actor, quote } = await makeDraft();
  await deleteDraft(actor, quote.id);
  expect(await prisma.quote.count({ where: { id: quote.id } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { entity: "quote", entityId: quote.id } })).toBeGreaterThanOrEqual(2);
});

test("un cliente con presupuesto puede cambiar de datos sin afectar al presupuesto", async () => {
  const { actor, client, quote } = await makeDraft({ clientOver: { paymentTerms: "Contado" } });
  await updateClient(actor, client.id, { legalName: client.legalName, taxId: client.taxId, paymentTerms: "90 días" });
  expect((await getQuote(quote.id)).paymentTerms).toBe("Contado");
});

test("un título o una descripción pegados con saltos de línea se guardan en una sola línea", async () => {
  const { actor, sub, section } = await makeDraft();
  const line = await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" });
  await updateLine(actor, line.id, { description: "Hora de\n  programador\r\nen planta" });
  await updateSection(actor, section.id, { title: "BOMBEO\nDE LÍNEA" });
  expect((await prisma.quoteLine.findUniqueOrThrow({ where: { id: line.id } })).description).toBe("Hora de programador en planta");
  expect((await prisma.quoteSection.findUniqueOrThrow({ where: { id: section.id } })).title).toBe("BOMBEO DE LÍNEA");
});

test("en la instantánea y el editor, las líneas sueltas van antes que las de los conjuntos", async () => {
  const { actor, quote, sub } = await makeDraft();
  await addKitInstance(actor, sub.id, { templateId: "kit-bomba", quantity: "1", params: { distancia: "5" }, choices: { main: "concept-bom-mayor75", c1: "concept-man-4x25" } });
  await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" });
  const lines = (await getQuote(quote.id)).sections[0].children[0].lines;
  expect(lines.map((l) => l.kitSlot ?? l.conceptId)).toEqual(["concept-ser-prog", "main", "c1"]);
});

test("cualquier cambio en el borrador deja como responsable a quien lo hace", async () => {
  const { actor, quote, sub } = await makeDraft();
  const other = await makeUser("presupuestador");
  await addCustomLine(other, sub.id, { description: "Soporte", unitName: "ud", quantity: "1", unitPrice: "10", taxId: "iva-21" });
  expect((await getQuote(quote.id)).ownerId).toBe(other.id);
  await updateSection(actor, sub.id, { title: "Equipos" });
  expect((await getQuote(quote.id)).ownerId).toBe(actor.id);
});

test("el tipo solo se elige en el primer borrador y ha de estar activo", async () => {
  const t1 = await quoteType(1);
  const t2 = await quoteType(2);
  const { actor, quote } = await makeDraft();
  await prisma.quoteType.update({ where: { id: t2.id }, data: { active: false } });
  await expect(updateHeader(actor, quote.id, { typeId: t2.id })).rejects.toMatchObject({ issues: { typeId: "Elige un tipo activo" } });
  await updateHeader(actor, quote.id, { typeId: t1.id });
  expect((await getQuote(quote.id)).typeId).toBe(t1.id);
  await prisma.quote.update({ where: { id: quote.id }, data: { seq: 3, seqYear: 2026, typeCode: 1, revision: 1 } });
  await prisma.quoteType.update({ where: { id: t2.id }, data: { active: true } });
  await expect(updateHeader(actor, quote.id, { typeId: t2.id })).rejects.toMatchObject({ issues: { typeId: "El tipo solo se elige en el primer borrador" } });
});

test("con un solo tipo activo, el borrador nuevo lo trae elegido; con dos, no", async () => {
  const t1 = await quoteType(1);
  const a = await makeDraft();
  expect(a.quote.typeId).toBe(t1.id);
  await quoteType(2);
  const b = await makeDraft();
  expect(b.quote.typeId).toBeNull();
});

test("ocultar la cantidad de una línea y el total de una subpartida no cambia el importe", async () => {
  const { actor, quote, sub } = await makeDraft();
  const l = await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "2" });
  await updateLine(actor, l.id, { showQuantity: false });
  await updateSection(actor, sub.id, { showTotal: false });
  const q = await getQuote(quote.id);
  const s = q.sections[0].children[0];
  expect([q.base.toFixed(2), s.showTotal, s.lines[0].showQuantity, s.lines[0].visible]).toEqual(["100.00", false, false, true]);
});

test("vaciar el cliente de la cabecera da un error en español", async () => {
  const { actor, quote } = await makeDraft();
  await expect(updateHeader(actor, quote.id, { clientId: "", ownerId: actor.id })).rejects.toMatchObject({ issues: { clientId: "Elige un cliente" } });
});
