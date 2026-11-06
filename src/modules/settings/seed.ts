import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Default rows: the single CompanySettings row (texts come from the schema defaults) and IVA 21 %.
 * The settings migration inserts the same rows in SQL; keep both in step.
 */
export async function seedDefaults(tx: Prisma.TransactionClient | PrismaClient): Promise<void> {
  await tx.companySettings.create({ data: { id: 1 } });
  await tx.tax.create({ data: { id: "iva-21", name: "IVA 21 %", ratePct: "21.00", isDefault: true, active: true } });
}
