import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import type { Prisma } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import { assertEmailFree, setPassword } from "@/modules/auth/admin-cli";
import { auth } from "@/modules/auth/auth";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser, Role } from "@/modules/auth/session";
import { createUserInput, roleSchema, type CreateUserInput } from "./schema";

/** `issued`/`drafts`: quotes (not draft / draft) where the user is the responsible or the creator. */
export type UserRow = { id: string; name: string; email: string; role: Role; active: boolean; createdAt: Date; issued: number; drafts: number };

const LAST_ADMIN = "Debe quedar al menos un administrador activo";
const toRole = (role: string | null): Role => (role === "admin" ? "admin" : "presupuestador");

export async function listUsers(actor: CurrentUser): Promise<UserRow[]> {
  assertAdmin(actor);
  const [users, counts] = await Promise.all([prisma.user.findMany(), quoteCounts(prisma)]);
  return users
    .map((u) => ({
      id: u.id, name: u.name, email: u.email, role: toRole(u.role), active: !u.banned, createdAt: u.createdAt,
      ...(counts.get(u.id) ?? { issued: 0, drafts: 0 }),
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es"));
}

/** Names of active users, for the «responsable» picker; any signed-in user may read them. */
export async function listActiveUserNames(): Promise<{ id: string; name: string }[]> {
  const users = await prisma.user.findMany({ where: { OR: [{ banned: false }, { banned: null }] }, select: { id: true, name: true } });
  return users.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function createUser(actor: CurrentUser, raw: CreateUserInput): Promise<{ id: string }> {
  assertAdmin(actor);
  const input = parseOrThrow(createUserInput, raw);
  const hash = await (await auth.$context).password.hash(input.password);
  return prisma.$transaction(async (tx) => {
    await assertEmailFree(tx, input.email);
    const user = await tx.user.create({
      data: { id: randomUUID(), name: input.name, email: input.email, role: input.role, emailVerified: true },
    });
    // Same credential row Better Auth writes on sign-up, so the user can sign in with email and password.
    await tx.account.create({
      data: { id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: hash },
    });
    await logAction(tx, {
      userId: actor.id, entity: "user", entityId: user.id, action: "create",
      summary: `Alta de ${input.name} (${input.email}) como ${input.role}`,
    });
    return { id: user.id };
  });
}

export async function setRole(actor: CurrentUser, userId: string, role: Role): Promise<void> {
  assertAdmin(actor);
  const newRole = parseOrThrow(roleSchema, role);
  await prisma.$transaction(async (tx) => {
    const user = await findUser(tx, userId);
    if (toRole(user.role) === newRole) return;
    if (newRole !== "admin") await assertAnotherActiveAdmin(tx, user.id);
    await tx.user.update({ where: { id: user.id }, data: { role: newRole } });
    await logAction(tx, {
      userId: actor.id, entity: "user", entityId: user.id, action: "role",
      summary: `${user.name}: rol ${toRole(user.role)} → ${newRole}`,
    });
  });
}

/** Ban without expiry and close every open session, so access is lost immediately. */
export async function deactivateUser(actor: CurrentUser, userId: string): Promise<void> {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const user = await findUser(tx, userId);
    if (user.banned) return;
    await assertAnotherActiveAdmin(tx, user.id);
    await tx.user.update({ where: { id: user.id }, data: { banned: true, banReason: "Desactivado", banExpires: null } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await logAction(tx, { userId: actor.id, entity: "user", entityId: user.id, action: "deactivate", summary: `${user.name} desactivado` });
  });
}

export async function reactivateUser(actor: CurrentUser, userId: string): Promise<void> {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const user = await findUser(tx, userId);
    if (!user.banned) return;
    await tx.user.update({ where: { id: user.id }, data: { banned: false, banReason: null, banExpires: null } });
    await logAction(tx, { userId: actor.id, entity: "user", entityId: user.id, action: "reactivate", summary: `${user.name} reactivado` });
  });
}

/** Only someone with nothing issued: their name is not frozen in any issued document. */
export async function renameUser(actor: CurrentUser, userId: string, rawName: string): Promise<void> {
  assertAdmin(actor);
  const { name } = parseOrThrow(createUserInput.pick({ name: true }), { name: rawName });
  await prisma.$transaction(async (tx) => {
    const user = await findUser(tx, userId);
    if (user.name === name) return;
    if ((await quoteCounts(tx, user.id)).get(user.id)?.issued) throw new ValidationError({ name: "Tiene presupuestos emitidos: su nombre ya no se puede cambiar" });
    await tx.user.update({ where: { id: user.id }, data: { name } });
    await logAction(tx, { userId: actor.id, entity: "user", entityId: user.id, action: "update", summary: `Nombre: ${user.name} → ${name}` });
  });
}

/**
 * Only someone with nothing issued. Their drafts pass to the admin who deletes; what they wrote keeps their name
 * (copied here, the relations become null). Quote.ownerId/createdById stay Restrict: an issue racing this fails it.
 */
export async function deleteUser(actor: CurrentUser, userId: string): Promise<void> {
  assertAdmin(actor);
  if (userId === actor.id) throw new ValidationError({ _: "No puedes eliminarte a ti mismo" });
  await prisma.$transaction(async (tx) => {
    const user = await findUser(tx, userId);
    await assertAnotherActiveAdmin(tx, user.id);
    const { issued = 0, drafts = 0 } = (await quoteCounts(tx, user.id)).get(user.id) ?? {};
    if (issued) throw new ValidationError({ _: "Tiene presupuestos emitidos: solo se puede desactivar" });
    await tx.quote.updateMany({ where: { ownerId: user.id }, data: { ownerId: actor.id } });
    await tx.quote.updateMany({ where: { createdById: user.id }, data: { createdById: actor.id } });
    await tx.auditLog.updateMany({ where: { userId: user.id }, data: { userName: user.name } });
    await tx.priceAdjustment.updateMany({ where: { userId: user.id }, data: { userName: user.name } });
    await tx.quoteNote.updateMany({ where: { authorId: user.id }, data: { authorName: user.name } });
    await tx.quoteNoteVersion.updateMany({ where: { authorId: user.id }, data: { authorName: user.name } });
    await tx.user.delete({ where: { id: user.id } });
    await logAction(tx, {
      userId: actor.id, entity: "user", entityId: user.id, action: "delete",
      summary: `Baja de ${user.name} (${user.email}); ${drafts} borradores pasan a ${actor.name}`,
    });
  });
}

export async function adminResetPassword(actor: CurrentUser, userId: string, password: string): Promise<void> {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const user = await findUser(tx, userId);
    await setPassword(tx, user.id, password);
    await logAction(tx, { userId: actor.id, entity: "user", entityId: user.id, action: "password", summary: `Contraseña de ${user.name} restablecida` });
  });
}

/** Per user: quotes (not draft / draft) where they are the responsible or the creator, each quote counted once. */
async function quoteCounts(db: Prisma.TransactionClient, userId?: string): Promise<Map<string, { issued: number; drafts: number }>> {
  const rows = await db.$queryRaw<{ id: string; issued: number; drafts: number }[]>`
    SELECT u.id, count(*) FILTER (WHERE q.status <> 'DRAFT')::int AS issued, count(*) FILTER (WHERE q.status = 'DRAFT')::int AS drafts
    FROM "user" u JOIN "Quote" q ON q."ownerId" = u.id OR q."createdById" = u.id
    WHERE ${userId ?? null}::text IS NULL OR u.id = ${userId ?? null}
    GROUP BY u.id`;
  return new Map(rows.map((r) => [r.id, { issued: r.issued, drafts: r.drafts }]));
}

async function findUser(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("El usuario no existe");
  return user;
}

/**
 * Throws if `userId` is an active admin and no other active admin exists.
 * FOR UPDATE locks the active admin rows, so two admins demoting each other at once cannot both pass.
 */
async function assertAnotherActiveAdmin(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "user" WHERE role = 'admin' AND banned IS NOT TRUE FOR UPDATE`;
  const isActiveAdmin = admins.some((a) => a.id === userId);
  if (isActiveAdmin && admins.length <= 1) throw new ValidationError({ _: LAST_ADMIN });
}
