import { z } from "zod";
import { Prisma } from "@/generated/prisma/browser";
import { isAmbiguousDecimal, parseDecimalEs } from "./decimal";

type Range = { min?: number; max?: number };

/** Required number: the output is always a string. */
export const decimalField = (range: Range = {}) => field(false, range) as unknown as z.ZodType<string, string | undefined>;
/** Optional number: empty or missing gives null. */
export const optionalDecimalField = (range: Range = {}) => field(true, range);

/**
 * A number typed the Spanish way, kept as a normalised string for a Prisma Decimal.
 * Empty gives null for the optional variant, an error for the required one; "1.500" is rejected as ambiguous.
 */
function field(optional: boolean, { min = 0, max = 999999999 }: Range) {
  return z.string().optional().transform((value, ctx): string | null => {
    const s = (value ?? "").trim();
    if (!s) {
      if (optional) return null;
      ctx.addIssue({ code: "custom", message: "Escribe un número" });
      return z.NEVER;
    }
    const n = parseDecimalEs(s);
    if (n === null) {
      ctx.addIssue({
        code: "custom",
        message: isAmbiguousDecimal(s) ? `«${s}» es ambiguo: escribe 1500 si son mil quinientos, o 1,5 si lleva decimales` : "Escribe un número, por ejemplo 12,50",
      });
      return z.NEVER;
    }
    const d = new Prisma.Decimal(n);
    if (d.lt(min) || d.gt(max)) {
      ctx.addIssue({ code: "custom", message: `Debe estar entre ${min} y ${max}` });
      return z.NEVER;
    }
    return n;
  });
}
