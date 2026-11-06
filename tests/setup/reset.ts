import { beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { seedDefaults } from "@/modules/settings/seed";

/** Empties every table (except Prisma's) and re-inserts the migration seed, so each test starts clean. */
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  await seedDefaults(prisma);
}

beforeEach(resetDb);
