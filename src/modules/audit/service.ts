import { parseIsoDate, startOfMadridDay } from "@/lib/dates";
import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";

export const AUDIT_PAGE_SIZE = 50;
/** Author filter value for entries without a user (automatic actions). */
export const SYSTEM = "Sistema";

export type AuditEntry = {
  id: string;
  createdAt: Date;
  userName: string | null;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
};

/** Live name of the author, or the name copied when that user was deleted; null means the system. */
export const authorLabel = (live: { name: string } | null, saved: string | null): string | null =>
  live?.name ?? (saved ? `${saved} (eliminado)` : null);

/** Receives the caller's transaction so the action and its log entry are saved together. */
export async function logAction(
  tx: Prisma.TransactionClient | PrismaClient,
  entry: { userId: string | null; entity: string; entityId: string; action: string; summary: string; data?: unknown },
): Promise<void> {
  await tx.auditLog.create({
    data: { ...entry, data: entry.data === undefined ? undefined : (entry.data as Prisma.InputJsonValue) },
  });
}

export async function listAudit(
  user: CurrentUser,
  filter: { q?: string; entity?: string; entityId?: string; userName?: string; action?: string; from?: string; to?: string; page?: number },
): Promise<{ items: AuditEntry[]; total: number }> {
  assertAdmin(user);
  const from = filter.from ? startOfMadridDay(filter.from) : null;
  const to = filter.to ? parseIsoDate(filter.to) : null;
  const toNext = to && startOfMadridDay(new Date(to.getTime() + 86_400_000).toISOString().slice(0, 10));
  const byUser: Prisma.AuditLogWhereInput | undefined = !filter.userName ? undefined
    : filter.userName === SYSTEM ? { userId: null, userName: null }
    : { OR: [{ user: { name: filter.userName } }, { userId: null, userName: filter.userName }] };
  const where: Prisma.AuditLogWhereInput = {
    entity: filter.entity || undefined, entityId: filter.entityId || undefined, action: filter.action || undefined,
    summary: filter.q?.trim() ? { contains: filter.q.trim(), mode: "insensitive" } : undefined,
    createdAt: from || toNext ? { gte: from ?? undefined, lt: toNext ?? undefined } : undefined,
    ...byUser,
  };
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      userName: authorLabel(r.user, r.userName),
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      summary: r.summary,
    })),
  };
}

/** Names for the author filter: current users plus the deleted ones that appear in the log. */
export async function listAuditUserNames(): Promise<string[]> {
  const [users, deleted] = await Promise.all([
    prisma.user.findMany({ select: { name: true } }),
    prisma.auditLog.findMany({ where: { userId: null, userName: { not: null } }, select: { userName: true }, distinct: ["userName"] }),
  ]);
  return [...new Set([...users.map((u) => u.name), ...deleted.map((d) => d.userName!)])].sort((a, b) => a.localeCompare(b, "es"));
}
