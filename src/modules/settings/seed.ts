import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Default rows: the single CompanySettings row (texts come from the schema defaults), IVA 21 % and the catalog lists.
 * The settings migration inserts the same rows in SQL; keep both in step.
 */
export async function seedDefaults(tx: Prisma.TransactionClient | PrismaClient): Promise<void> {
  await tx.companySettings.create({ data: { id: 1 } });
  await tx.tax.create({ data: { id: "iva-21", name: "IVA 21 %", ratePct: "21.00", isDefault: true, active: true } });
  await tx.category.createMany({ data: CATEGORIES });
  await tx.unit.createMany({ data: UNITS });
}

// Initial catalog lists; the catalog_lists migration inserts the same rows.
const CATEGORIES = [
  { id: "cat-servicios", name: "Servicios" }, { id: "cat-personal", name: "Personal" }, { id: "cat-material", name: "Material" },
  { id: "cat-mangueras", name: "Mangueras" }, { id: "cat-bombas", name: "Bombas" },
];
const UNITS = [{ id: "unit-km", name: "km" }, { id: "unit-h", name: "h" }, { id: "unit-m", name: "m" }, { id: "unit-ud", name: "ud" }];
