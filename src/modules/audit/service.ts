import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";

export const AUDIT_PAGE_SIZE = 50;

export type AuditEntry = {
  id: string;
  createdAt: Date;
  userName: string | null;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
};

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
  filter: { entity?: string; entityId?: string; page?: number },
): Promise<{ items: AuditEntry[]; total: number }> {
  assertAdmin(user);
  const where = { entity: filter.entity || undefined, entityId: filter.entityId || undefined };
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
      userName: r.user?.name ?? null,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      summary: r.summary,
    })),
  };
}
