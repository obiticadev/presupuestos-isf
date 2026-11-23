import { z } from "zod";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { Prisma, type QuoteType } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";

const CODE = "Código de 1 a 999";
const quoteTypeInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Escribe el nombre").max(60, "Máximo 60 caracteres"),
  code: z.coerce.number({ error: CODE }).int(CODE).min(1, CODE).max(999, CODE),
});

/** The type code as it goes in the reference: 7 → "007". */
export const formatTypeCode = (code: number) => String(code).padStart(3, "0");

export function listQuoteTypes(opts: { includeInactive?: boolean } = {}) {
  return prisma.quoteType.findMany({
    where: opts.includeInactive ? undefined : { active: true },
    orderBy: { code: "asc" },
    include: { _count: { select: { quotes: true } } },
  });
}

/** A used type keeps its code, so the typeId of a draft and the typeCode frozen when numbering never disagree. */
export async function saveQuoteType(actor: CurrentUser, raw: { id?: string; name: string; code: string | number }): Promise<QuoteType> {
  assertAdmin(actor);
  const input = parseOrThrow(quoteTypeInput, raw);
  return prisma.$transaction(async (tx) => {
    const clash = await tx.quoteType.findUnique({ where: { code: input.code } });
    if (clash && clash.id !== input.id) throw new ValidationError({ code: "Ya existe" });
    const before = input.id ? await tx.quoteType.findUnique({ where: { id: input.id }, include: { _count: { select: { quotes: true } } } }) : null;
    if (input.id && !before) throw new NotFoundError("Tipo no encontrado");
    if (before && before.code !== input.code && before._count.quotes > 0) throw new ValidationError({ code: "Ya se usa: el código no se cambia" });
    const data = { name: input.name, code: input.code };
    const row = before ? await tx.quoteType.update({ where: { id: before.id }, data }) : await tx.quoteType.create({ data });
    await logAction(tx, {
      userId: actor.id, entity: "quoteType", entityId: row.id, action: before ? "update" : "create",
      summary: before ? `Tipo ${formatTypeCode(before.code)} ${before.name} cambiado a ${formatTypeCode(row.code)} ${row.name}` : `Alta del tipo ${formatTypeCode(row.code)} ${row.name}`,
    });
    return row;
  });
}

export async function setQuoteTypeActive(actor: CurrentUser, id: string, active: boolean) {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const row = await tx.quoteType.update({ where: { id }, data: { active } });
    await logAction(tx, {
      userId: actor.id, entity: "quoteType", entityId: id, action: active ? "reactivate" : "deactivate",
      summary: `Tipo ${formatTypeCode(row.code)} ${row.name} ${active ? "activado" : "desactivado"}`,
    });
  });
}

export async function deleteQuoteType(actor: CurrentUser, id: string) {
  assertAdmin(actor);
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.quoteType.delete({ where: { id } });
      await logAction(tx, { userId: actor.id, entity: "quoteType", entityId: id, action: "delete", summary: `Tipo ${formatTypeCode(row.code)} ${row.name} borrado` });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new ValidationError({ _: "Está en uso: desactívalo" });
    throw error;
  }
}
