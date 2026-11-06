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

export type UserRow = { id: string; name: string; email: string; role: Role; active: boolean; createdAt: Date };

const LAST_ADMIN = "Debe quedar al menos un administrador activo";
const toRole = (role: string | null): Role => (role === "admin" ? "admin" : "presupuestador");

export async function listUsers(actor: CurrentUser): Promise<UserRow[]> {
  assertAdmin(actor);
  const users = await prisma.user.findMany();
  return users
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: toRole(u.role), active: !u.banned, createdAt: u.createdAt }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es"));
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

export async function adminResetPassword(actor: CurrentUser, userId: string, password: string): Promise<void> {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const user = await findUser(tx, userId);
    await setPassword(tx, user.id, password);
    await logAction(tx, { userId: actor.id, entity: "user", entityId: user.id, action: "password", summary: `Contraseña de ${user.name} restablecida` });
  });
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
