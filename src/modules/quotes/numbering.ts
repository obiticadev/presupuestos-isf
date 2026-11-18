import { Prisma, type CompanySettings } from "@/generated/prisma/client";
import { ValidationError } from "@/lib/errors";
import type { Tx } from "./service";

const NUMBER = /\{(N{1,8})\}/;
const pad = (n: number, width: number) => String(n).padStart(width, "0");

/**
 * "PR-{AAAA}{TTT}{NNN}-R{RR}" + {2026, 1, 7, 0, 0} → "PR-2026001007-R00"; an extension goes right after the number
 * ("PR-2026001007-A01-R00"). Numbers longer than the N run are not cut.
 */
export function formatReference(pattern: string, p: { year: number; typeCode: number; seq: number; extension: number; revision: number }): string {
  return pattern
    .replace("{AAAA}", String(p.year))
    .replace("{TTT}", pad(p.typeCode, 3))
    .replace(NUMBER, (_, n: string) => pad(p.seq, n.length) + (p.extension > 0 ? `-A${pad(p.extension, 2)}` : ""))
    .replace("{RR}", pad(p.revision, 2));
}

/** The pattern cut right after the number: what a quote, its revisions and its extensions share ("PR-2026001007"). */
export function baseReference(pattern: string, p: { year: number; typeCode: number; seq: number }): string {
  const m = NUMBER.exec(pattern);
  const head = m ? pattern.slice(0, m.index + m[0].length) : pattern;
  return formatReference(head, { ...p, extension: 0, revision: 0 });
}

/**
 * Next number of a type, inside the issuing transaction: the UPDATE row-locks the counter, so concurrent issues queue up,
 * and a rolled-back issue gives its number back (no gaps). Past the N run (999 for {NNN}) it refuses.
 */
export async function nextNumber(
  tx: Tx, year: number, type: { code: number; name: string },
  s: Pick<CompanySettings, "numberYearlyReset" | "numberStart" | "numberPattern">,
): Promise<number> {
  const code = pad(type.code, 3);
  const key = `${s.numberYearlyReset ? year : "global"}-${code}`;
  await tx.$executeRaw`INSERT INTO "NumberCounter" ("key", "value") VALUES (${key}, ${s.numberStart - 1}) ON CONFLICT ("key") DO NOTHING`;
  // Never below what is already issued in this counter's scope (the type in the year, or ever): switching the yearly reset
  // after issuing would otherwise hand out a number that exists, and that failure would repeat on every issue.
  const issued = s.numberYearlyReset
    ? Prisma.sql`SELECT MAX("seq") FROM "Quote" WHERE "typeCode" = ${type.code} AND "seqYear" = ${year}`
    : Prisma.sql`SELECT MAX("seq") FROM "Quote" WHERE "typeCode" = ${type.code}`;
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    UPDATE "NumberCounter" SET "value" = GREATEST("value", COALESCE((${issued}), 0)) + 1 WHERE "key" = ${key} RETURNING "value"`;
  const max = 10 ** (NUMBER.exec(s.numberPattern)?.[1].length ?? 3) - 1;
  if (row.value > max)
    throw new ValidationError({ _: `El contador del tipo ${code} (${type.name}) ya llegó al ${max}${s.numberYearlyReset ? " este año" : ""}: no quedan números` });
  return row.value;
}
