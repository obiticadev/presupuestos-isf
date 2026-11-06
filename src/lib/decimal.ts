import { Prisma } from "@/generated/prisma/client";

const PLAIN = /^-?\d+(\.\d+)?$/; // "21", "21.50"
const SPANISH = /^-?(\d{1,3}(\.\d{3})+|\d+),\d+$/; // "21,5", "1.234,56"

/**
 * Reads a number typed the Spanish way and returns it normalised with a dot ("1.234,56" → "1234.56"),
 * as a string so it can go straight into a Prisma Decimal without passing through a float.
 * A dot alone is a decimal point ("21.50"); with a comma, dots are thousands separators.
 */
export function parseDecimalEs(input: string): string | null {
  const s = input.trim();
  if (PLAIN.test(s)) return s;
  if (SPANISH.test(s)) return s.replace(/\./g, "").replace(",", ".");
  return null;
}

/**
 * Formats a decimal the Spanish way ("1.234,50"), rounding half-up to `max` decimals and padding to `min`.
 * Defaults to 2 and 2, the format of every amount; prices use { max: 4 }.
 */
export function formatDecimalEs(value: Prisma.Decimal | string, opts: { min?: number; max?: number } = {}): string {
  const { min = 2, max = 2 } = opts;
  const fixed = new Prisma.Decimal(value).toDecimalPlaces(max, Prisma.Decimal.ROUND_HALF_UP).toFixed();
  const [int, frac = ""] = fixed.split(".");
  const sign = int.startsWith("-") ? "-" : "";
  const digits = int.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimals = frac.padEnd(min, "0");
  return `${sign}${digits}${decimals ? `,${decimals}` : ""}`;
}
