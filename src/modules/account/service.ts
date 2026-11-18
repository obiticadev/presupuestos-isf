import { APIError } from "better-auth/api";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import type { Prisma } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import { auth } from "@/modules/auth/auth";
import type { CurrentUser } from "@/modules/auth/session";
import { passwordInput, type PasswordInput } from "./schema";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_SIGNATURE_BYTES = 200 * 1024;

/** Trust boundary for the drawn signature: a real PNG, at most 200 KB, between 20×10 and 4000×2000 px. */
export function checkSignaturePng(bytes: Uint8Array): void {
  const ihdr = String.fromCharCode(...bytes.subarray(12, 16)); // the first chunk of a PNG is always IHDR
  if (bytes.length < 24 || PNG_MAGIC.some((b, i) => bytes[i] !== b) || ihdr !== "IHDR") throw new ValidationError({ signature: "La firma debe ser una imagen PNG" });
  if (bytes.length > MAX_SIGNATURE_BYTES) throw new ValidationError({ signature: "La firma no puede pasar de 200 KB" });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const [w, h] = [view.getUint32(16), view.getUint32(20)]; // IHDR width and height, big-endian
  if (w < 20 || w > 4000 || h < 10 || h > 2000) throw new ValidationError({ signature: "Tamaño de firma no válido" });
}

export async function getSignature(userId: string, tx: Prisma.TransactionClient = prisma): Promise<Uint8Array | null> {
  return (await tx.user.findUnique({ where: { id: userId }, select: { signature: true } }))?.signature ?? null;
}

const logSignature = (tx: Prisma.TransactionClient, actor: CurrentUser, summary: string) =>
  logAction(tx, { userId: actor.id, entity: "user", entityId: actor.id, action: "signature", summary });

/** Each user changes only their own signature. */
export async function saveSignature(actor: CurrentUser, bytes: Uint8Array): Promise<void> {
  checkSignaturePng(bytes);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { signature: Buffer.from(bytes) } });
    await logSignature(tx, actor, "Firma actualizada");
  });
}

export async function deleteSignature(actor: CurrentUser): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { signature: null } });
    await logSignature(tx, actor, "Firma eliminada");
  });
}

/** Changes the signed-in user's password through Better Auth and signs out their other sessions, keeping this one. */
export async function changeOwnPassword(actor: CurrentUser, input: PasswordInput, headers: Headers): Promise<void> {
  const { current, next } = parseOrThrow(passwordInput, input);
  try {
    // Not Better Auth's revokeOtherSessions: it replaces the current session too, and the page re-rendered
    // after the action still carries the old cookie, so the user would land on /login.
    await auth.api.changePassword({ body: { currentPassword: current, newPassword: next }, headers });
  } catch (e) {
    if (e instanceof APIError && e.body?.code === "INVALID_PASSWORD") throw new ValidationError({ current: "La contraseña actual no es correcta" });
    throw e;
  }
  const own = await auth.api.getSession({ headers });
  await prisma.session.deleteMany({ where: { userId: actor.id, ...(own && { NOT: { token: own.session.token } }) } });
  await logAction(prisma, { userId: actor.id, entity: "user", entityId: actor.id, action: "password", summary: "Contraseña cambiada" });
}
