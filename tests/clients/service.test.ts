import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  createClient, getClient, listClients, removeClient, removeContact, removeLocation, saveContact, saveLocation,
  setClientActive, updateClient,
} from "@/modules/clients/service";
import { makeUser } from "../helpers/users";

const datos = {
  legalName: "Talleres Henares, S.A.", taxId: "a-28 000.000", tradeName: "", fiscalAddress: "", notes: "",
  paymentTerms: "30 días", exclusions: "", offerValidityDays: "",
};

test("un presupuestador crea un cliente y el CIF se normaliza", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  expect(c.taxId).toBe("A28000000");
  expect(c.offerValidityDays).toBeNull();
  expect(await prisma.auditLog.count({ where: { entity: "client", entityId: c.id, action: "create" } })).toBe(1);
});

test("CIF repetido con otro formato se rechaza", async () => {
  const p = await makeUser("presupuestador");
  await createClient(p, datos);
  await expect(createClient(p, { ...datos, taxId: "A28000000" })).rejects.toThrow("Ya existe un cliente con ese CIF/NIF");
});

test.each(["", "  ", "B-12#4"])("CIF «%s» se rechaza", async (taxId) => {
  const p = await makeUser("presupuestador");
  await expect(createClient(p, { ...datos, taxId })).rejects.toThrow(ValidationError);
});

test("validez propia: entero de 1 a 365", async () => {
  const p = await makeUser("presupuestador");
  expect((await createClient(p, { ...datos, offerValidityDays: "45" })).offerValidityDays).toBe(45);
  await expect(createClient(p, { ...datos, taxId: "B1", offerValidityDays: "0" })).rejects.toThrow(ValidationError);
  await expect(createClient(p, { ...datos, taxId: "B2", offerValidityDays: "1,5" })).rejects.toThrow(ValidationError);
});

test("editar un cliente cambia sus datos", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  await updateClient(p, c.id, { ...datos, legalName: "Talleres Henares, S.L." });
  expect((await getClient(c.id)).legalName).toBe("Talleres Henares, S.L.");
});

test("contactos y ubicaciones: varios por cliente, email validado", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  await saveContact(p, c.id, { name: "Laura Medina", role: "Mantenimiento", email: "lmedina@ejemplo.es", phone: "" });
  await saveContact(p, c.id, { name: "Óscar Prieto", role: "", email: "", phone: "600000002" });
  await saveLocation(p, c.id, { name: "Nave 3", address: "C/ Forja 2", installation: "Torrejón de Ardoz", country: "Madrid" });
  await expect(saveContact(p, c.id, { name: "X", role: "", email: "no-es-email", phone: "" })).rejects.toThrow(ValidationError);
  const d = await getClient(c.id);
  expect([d.contacts.length, d.locations.length]).toEqual([2, 1]);
});

test("editar y eliminar un contacto y una ubicación", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  const contact = await saveContact(p, c.id, { name: "Laura", role: "", email: "", phone: "" });
  await saveContact(p, c.id, { id: contact.id, name: "Laura Medina", role: "Jefa", email: "", phone: "" });
  const loc = await saveLocation(p, c.id, { name: "Nave 3", address: "", installation: "", country: "" });
  expect((await getClient(c.id)).contacts[0].name).toBe("Laura Medina");
  expect(await removeContact(p, contact.id)).toBe("deleted");
  expect(await removeLocation(p, loc.id)).toBe("deleted");
  const d = await getClient(c.id);
  expect([d.contacts.length, d.locations.length]).toEqual([0, 0]);
});

test("buscar por CIF o nombre comercial", async () => {
  const p = await makeUser("presupuestador");
  await createClient(p, { ...datos, tradeName: "THSA" });
  expect((await listClients({ q: "28000" })).total).toBe(1);
  expect((await listClients({ q: "thsa" })).total).toBe(1);
  expect((await listClients({ q: "nada" })).total).toBe(0);
});

test("un cliente desactivado solo se lista si se pide", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  await setClientActive(p, c.id, false);
  expect((await listClients({})).total).toBe(0);
  expect((await listClients({ status: "all" })).total).toBe(1);
});

test("eliminar un cliente sin presupuestos lo borra con sus contactos", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  await saveContact(p, c.id, { name: "L", role: "", email: "", phone: "" });
  expect(await removeClient(p, c.id)).toBe("deleted");
  expect(await prisma.clientContact.count()).toBe(0);
  await expect(getClient(c.id)).rejects.toThrow(NotFoundError);
  expect(await prisma.auditLog.count({ where: { entity: "client", entityId: c.id } })).toBeGreaterThanOrEqual(3);
});

test("una instalación guarda nombre, dirección, instalación y país", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  await saveLocation(p, c.id, { name: "Nave 3", address: "C/ Forja 2", installation: "EDAR Sur", country: "España" });
  const loc = (await getClient(c.id)).locations[0];
  expect([loc.installation, loc.country]).toEqual(["EDAR Sur", "España"]);
  const log = await prisma.auditLog.findMany({ where: { entity: "client", entityId: c.id } });
  expect(log.map((l) => l.summary)).toContain("Talleres Henares, S.A.: instalación Nave 3 añadida");
});
