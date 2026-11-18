import { z } from "zod";
import { parseDecimalEs } from "@/lib/decimal";

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

/** A percentage typed the Spanish way, kept as a normalised string (never a float). */
export const percent = (max: number) =>
  z.string().transform((value, ctx) => {
    const n = parseDecimalEs(value);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: "Escribe un número, por ejemplo 21 o 21,5" });
      return z.NEVER;
    }
    if (Number(n) < 0 || Number(n) > max) {
      ctx.addIssue({ code: "custom", message: `Debe estar entre 0 y ${max}` });
      return z.NEVER;
    }
    return n;
  });

export const settingsInput = z
  .object({
    legalName: text(200).min(1, "Escribe la razón social"),
    taxId: text(20),
    address: text(300),
    phone: text(50),
    email: z.union([z.literal(""), z.email("Email no válido")]),
    registryText: text(2000).transform((v) => v.replace(/\s*\r?\n\s*/g, " ")),
    letterGreeting: text(200),
    letterIntro: text(2000),
    letterClosing: text(4000),
    letterPlace: text(100),
    defaultExclusions: text(8000),
    defaultPaymentTerms: text(4000),
    offerValidityDays: z.string().trim().regex(/^\d+$/, "Escribe un número de días")
      .transform(Number).refine((n) => n >= 1 && n <= 365, "Entre 1 y 365 días"),
    defaultMarginPct: percent(999),
    travelOriginText: text(200),
    numberPattern: text(60).refine((v) => /\{N{1,8}\}/.test(v) && v.includes("{RR}"), "Debe llevar el número ({NNNNNN}) y la revisión ({RR})"),
    numberYearlyReset: z.enum(["si", "no"], { message: "Elige sí o no" }).transform((v) => v === "si"),
    numberStart: z.string().trim().regex(/^\d{1,8}$/, "Escribe un número entero").transform(Number).refine((n) => n >= 1, "Desde 1"),
  })
  .partial();

export type SettingsInput = z.input<typeof settingsInput>;

export const taxInput = z.object({
  id: z.string().optional(),
  name: text(50).min(1, "Escribe el nombre"),
  ratePct: percent(100),
  isDefault: z.boolean(),
});

export type TaxInput = z.input<typeof taxInput>;
