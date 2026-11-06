import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "./auth";

type Db = Prisma.TransactionClient | typeof prisma;

export async function assertEmailFree(db: Db, email: string): Promise<void> {
  if (await db.user.findUnique({ where: { email } })) {
    throw new ValidationError({ email: "Ya existe un usuario con ese email" });
  }
}

/** Replaces the credential password (hashed the way Better Auth does) and closes every session of the user. */
export async function setPassword(db: Db, userId: string, password: string): Promise<void> {
  const ctx = await auth.$context;
  if (password.length < ctx.password.config.minPasswordLength) {
    throw new ValidationError({ password: `La contraseña debe tener al menos ${ctx.password.config.minPasswordLength} caracteres` });
  }
  const hash = await ctx.password.hash(password);
  const { count } = await db.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: hash } });
  if (count === 0) throw new NotFoundError("El usuario no tiene contraseña local");
  await db.session.deleteMany({ where: { userId } });
}

export async function createAdmin(input: { email: string; name: string; password: string }): Promise<{ id: string }> {
  await assertEmailFree(prisma, input.email);
  const { user } = await auth.api.createUser({ body: { ...input, role: "admin" } });
  return { id: user.id };
}

/** Recovery path: new password, user reactivated and logged out everywhere. */
export async function resetPassword(input: { email: string; password: string }): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new NotFoundError(`No existe ningún usuario con el email ${input.email}`);
  await prisma.$transaction(async (tx) => {
    await setPassword(tx, user.id, input.password);
    await tx.user.update({ where: { id: user.id }, data: { banned: false, banReason: null, banExpires: null } });
  });
}
