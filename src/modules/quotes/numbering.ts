import { Prisma, type CompanySettings } from "@/generated/prisma/client";
import type { Tx } from "./service";

/** "PR-{AAAA}{NNNNNN}-R{RR}" + {2026, 1029, 0} → "PR-2026001029-R00". Numbers longer than the N run are not cut. */
export function formatReference(pattern: string, p: { year: number; seq: number; revision: number }): string {
  return pattern
    .replace("{AAAA}", String(p.year))
    .replace(/\{(N{1,8})\}/, (_, n: string) => String(p.seq).padStart(n.length, "0"))
    .replace("{RR}", String(p.revision).padStart(2, "0"));
}

/**
 * Next number, inside the issuing transaction: the UPDATE row-locks the counter, so concurrent issues queue up,
 * and a rolled-back issue gives its number back (no gaps).
 */
export async function nextNumber(tx: Tx, year: number, s: Pick<CompanySettings, "numberYearlyReset" | "numberStart">): Promise<number> {
  const key = s.numberYearlyReset ? String(year) : "global";
  await tx.$executeRaw`INSERT INTO "NumberCounter" ("key", "value") VALUES (${key}, ${s.numberStart - 1}) ON CONFLICT ("key") DO NOTHING`;
  // Never below what is already issued in this counter's scope (the year, or everything): switching the yearly reset
  // after issuing would otherwise hand out a number that exists, and that failure would repeat on every issue.
  const issued = s.numberYearlyReset
    ? Prisma.sql`SELECT MAX("seq") FROM "Quote" WHERE "seqYear" = ${year}`
    : Prisma.sql`SELECT MAX("seq") FROM "Quote"`;
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    UPDATE "NumberCounter" SET "value" = GREATEST("value", COALESCE((${issued}), 0)) + 1 WHERE "key" = ${key} RETURNING "value"`;
  return row.value;
}
