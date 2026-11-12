import { prisma } from "@/lib/db";
import { deleteOrDeactivate } from "@/lib/delete-or-deactivate";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { Prisma, type Client, type ClientContact, type ClientLocation } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import { clientInput, contactInput, locationInput, type ClientInput, type ContactInput, type LocationInput } from "./schema";

// Spec 5.1: every signed-in user manages clients, so these functions take the actor only for the history.

export const CLIENTS_PAGE_SIZE = 50;
const ACTIVE_FIRST = [{ active: "desc" }, { name: "asc" }] as const;
const DETAIL = { contacts: { orderBy: [...ACTIVE_FIRST] }, locations: { orderBy: [...ACTIVE_FIRST] } } satisfies Prisma.ClientInclude;
export type ClientDetail = Prisma.ClientGetPayload<{ include: typeof DETAIL }>;
export type ClientRow = Prisma.ClientGetPayload<{ include: { _count: { select: { locations: true } } } }>;

export async function listClients(filter: { q?: string; status?: "active" | "inactive" | "all"; page?: number }): Promise<{ items: ClientRow[]; total: number }> {
  const { q, status = "active", page = 1 } = filter;
  const term = q?.trim();
  const where: Prisma.ClientWhereInput = {
    ...(status !== "all" && { active: status === "active" }),
    ...(term && {
      OR: [
        { legalName: { contains: term, mode: "insensitive" } },
        { tradeName: { contains: term, mode: "insensitive" } },
        { taxId: { contains: term.replace(/[\s.-]/g, ""), mode: "insensitive" } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where, include: { _count: { select: { locations: true } } }, orderBy: { legalName: "asc" },
      skip: (Math.max(1, page) - 1) * CLIENTS_PAGE_SIZE, take: CLIENTS_PAGE_SIZE,
    }),
    prisma.client.count({ where }),
  ]);
  return { items, total };
}

/** Active clients in a light shape, for pickers. */
export async function listClientOptions(): Promise<{ id: string; legalName: string; taxId: string }[]> {
  return prisma.client.findMany({ where: { active: true }, select: { id: true, legalName: true, taxId: true }, orderBy: { legalName: "asc" } });
}

export async function getClient(id: string): Promise<ClientDetail> {
  const client = await prisma.client.findUnique({ where: { id }, include: DETAIL });
  if (!client) throw new NotFoundError("El cliente no existe");
  return client;
}

/** Maps the unique-CIF violation to a field error (a prior lookup would race with a simultaneous insert). */
async function uniqueTaxId<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidationError({ taxId: "Ya existe un cliente con ese CIF/NIF" });
    }
    throw error;
  }
}

const log = (tx: Prisma.TransactionClient, actor: CurrentUser, clientId: string, action: string, summary: string) =>
  logAction(tx, { userId: actor.id, entity: "client", entityId: clientId, action, summary });

export async function createClient(actor: CurrentUser, raw: ClientInput): Promise<Client> {
  const data = parseOrThrow(clientInput, raw);
  return uniqueTaxId(() => prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data });
    await log(tx, actor, client.id, "create", `Alta de ${client.legalName} (${client.taxId})`);
    return client;
  }));
}

export async function updateClient(actor: CurrentUser, id: string, raw: ClientInput): Promise<Client> {
  const data = parseOrThrow(clientInput, raw);
  return uniqueTaxId(() => prisma.$transaction(async (tx) => {
    if (!(await tx.client.findUnique({ where: { id } }))) throw new NotFoundError("El cliente no existe");
    const client = await tx.client.update({ where: { id }, data });
    await log(tx, actor, id, "update", `${client.legalName}: datos actualizados`);
    return client;
  }));
}

export async function setClientActive(actor: CurrentUser, id: string, active: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundError("El cliente no existe");
    await tx.client.update({ where: { id }, data: { active } });
    await log(tx, actor, id, active ? "reactivate" : "deactivate", `${client.legalName} ${active ? "reactivado" : "desactivado"}`);
  });
}

/** «Eliminar»: deletes a client with no quotes (contacts and locations go with it); otherwise deactivates. */
export async function removeClient(actor: CurrentUser, id: string): Promise<"deleted" | "deactivated"> {
  const client = await getClient(id);
  return deleteOrDeactivate(
    () => prisma.$transaction(async (tx) => {
      await tx.client.delete({ where: { id } });
      await log(tx, actor, id, "delete", `Baja de ${client.legalName} (${client.taxId})`);
    }),
    () => prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { active: false } });
      await log(tx, actor, id, "deactivate", `${client.legalName} desactivado porque tiene presupuestos`);
    }),
  );
}

export async function saveContact(actor: CurrentUser, clientId: string, raw: ContactInput): Promise<ClientContact> {
  const { id, ...data } = parseOrThrow(contactInput, raw);
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError("El cliente no existe");
    if (id && !(await tx.clientContact.findFirst({ where: { id, clientId } }))) throw new NotFoundError("El contacto no existe");
    const contact = id ? await tx.clientContact.update({ where: { id }, data }) : await tx.clientContact.create({ data: { ...data, clientId } });
    await log(tx, actor, clientId, id ? "update" : "create", `${client.legalName}: contacto ${contact.name} ${id ? "modificado" : "añadido"}`);
    return contact;
  });
}

export async function saveLocation(actor: CurrentUser, clientId: string, raw: LocationInput): Promise<ClientLocation> {
  const { id, ...data } = parseOrThrow(locationInput, raw);
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError("El cliente no existe");
    if (id && !(await tx.clientLocation.findFirst({ where: { id, clientId } }))) throw new NotFoundError("La instalación no existe");
    const location = id ? await tx.clientLocation.update({ where: { id }, data }) : await tx.clientLocation.create({ data: { ...data, clientId } });
    await log(tx, actor, clientId, id ? "update" : "create", `${client.legalName}: instalación ${location.name} ${id ? "modificada" : "añadida"}`);
    return location;
  });
}

export async function removeContact(actor: CurrentUser, contactId: string): Promise<"deleted" | "deactivated"> {
  const contact = await prisma.clientContact.findUnique({ where: { id: contactId }, include: { client: true } });
  if (!contact) throw new NotFoundError("El contacto no existe");
  const summary = (what: string) => `${contact.client.legalName}: contacto ${contact.name} ${what}`;
  return deleteOrDeactivate(
    () => prisma.$transaction(async (tx) => {
      await tx.clientContact.delete({ where: { id: contactId } });
      await log(tx, actor, contact.clientId, "delete", summary("eliminado"));
    }),
    () => prisma.$transaction(async (tx) => {
      await tx.clientContact.update({ where: { id: contactId }, data: { active: false } });
      await log(tx, actor, contact.clientId, "deactivate", summary("desactivado porque lo usan presupuestos"));
    }),
  );
}

export async function removeLocation(actor: CurrentUser, locationId: string): Promise<"deleted" | "deactivated"> {
  const location = await prisma.clientLocation.findUnique({ where: { id: locationId }, include: { client: true } });
  if (!location) throw new NotFoundError("La instalación no existe");
  const summary = (what: string) => `${location.client.legalName}: instalación ${location.name} ${what}`;
  return deleteOrDeactivate(
    () => prisma.$transaction(async (tx) => {
      await tx.clientLocation.delete({ where: { id: locationId } });
      await log(tx, actor, location.clientId, "delete", summary("eliminada"));
    }),
    () => prisma.$transaction(async (tx) => {
      await tx.clientLocation.update({ where: { id: locationId }, data: { active: false } });
      await log(tx, actor, location.clientId, "deactivate", summary("desactivada porque la usan presupuestos"));
    }),
  );
}
