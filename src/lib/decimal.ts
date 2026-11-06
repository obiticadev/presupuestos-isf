// Browser entry: these helpers also run in client components (price suggestion, formatting).
import { Prisma } from "@/generated/prisma/browser";

const PLAIN = /^-?\d+(\.\d+)?$/; // "21", "21.50"
const SPANISH = /^-?(\d{1,3}(\.\d{3})+|\d+),\d+$/; // "21,5", "1.234,56"
const AMBIGUOUS = /^-?\d{1,3}\.\d{3}$/; // "1.500": thousands to a Spanish reader, 1.5 to the PLAIN rule

/** True for "1.500"-style input, which is rejected rather than guessed (it could mean 1500 or 1,5). */
export const isAmbiguousDecimal = (input: string) => AMBIGUOUS.test(input.trim());

/**
 * Reads a number typed the Spanish way and returns it normalised with a dot ("1.234,56" → "1234.56"),
 * as a string so it can go straight into a Prisma Decimal without passing through a float.
 * A dot alone is a decimal point ("21.50"); with a comma, dots are thousands separators.
 */
export function parseDecimalEs(input: string): string | null {
  const s = input.trim();
  if (AMBIGUOUS.test(s)) return null;
  if (PLAIN.test(s)) return s;
  if (SPANISH.test(s)) return s.replace(/\./g, "").replace(",", ".");
  return null;
}

/**
 * Formats a decimal the Spanish way ("1.234,50"), rounding half-up to `max` decimals and padding to `min`.
 * Defaults to 2 and 2, the format of every amount; prices use { max: 4 }.
 */
export function formatDecimalEs(value: { toString(): string } | string, opts: { min?: number; max?: number } = {}): string {
  const { min = 2, max = 2 } = opts;
  const fixed = new Prisma.Decimal(String(value)).toDecimalPlaces(max, Prisma.Decimal.ROUND_HALF_UP).toFixed();
  const [int, frac = ""] = fixed.split(".");
  const sign = int.startsWith("-") ? "-" : "";
  const digits = int.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimals = frac.padEnd(min, "0");
  return `${sign}${digits}${decimals ? `,${decimals}` : ""}`;
}

/** Sale price proposed from a cost and a margin: cost × (1 + margin/100), half-up to 2 decimals, Spanish format. */
export function suggestSalePrice(cost: string, marginPct: { toString(): string } | string): string | null {
  const c = parseDecimalEs(cost);
  if (c === null) return null;
  const factor = new Prisma.Decimal(1).plus(new Prisma.Decimal(String(marginPct)).div(100));
  return formatDecimalEs(new Prisma.Decimal(c).mul(factor));
}
