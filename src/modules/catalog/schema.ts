import { z } from "zod";
import { Prisma } from "@/generated/prisma/browser";
import { isAmbiguousDecimal, parseDecimalEs } from "@/lib/decimal";

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

/** Optional amount typed the Spanish way: empty ⇒ null, otherwise a normalised string between 0 and `max`. */
const amount = (max: number) =>
  z.string().optional().transform((value, ctx) => {
    const s = (value ?? "").trim();
    if (!s) return null;
    const n = parseDecimalEs(s);
    if (n === null) {
      const message = isAmbiguousDecimal(s)
        ? `«${s}» es ambiguo: escribe 1500 si son mil quinientos, o 1,5 si lleva decimales`
        : "Escribe un número, por ejemplo 12,50";
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    if (new Prisma.Decimal(n).lt(0) || new Prisma.Decimal(n).gt(max)) {
      ctx.addIssue({ code: "custom", message: `Debe estar entre 0 y ${max}` });
      return z.NEVER;
    }
    return n;
  });

export const conceptInput = z.object({
  code: z.string().transform((s) => s.trim().toUpperCase()).pipe(
    z.string().min(1, "Escribe el código").max(30, "Máximo 30 caracteres")
      .regex(/^[A-Z0-9._-]+$/, "Solo letras, números, punto, guion y guion bajo"),
  ),
  categoryId: z.string().min(1, "Elige una categoría"),
  description: text(300).min(1, "Escribe la descripción"),
  unitId: z.string().min(1, "Elige una unidad"),
  taxId: z.string().min(1, "Elige un impuesto"),
  salePrice: amount(999999999),
  cost: amount(999999999),
  listPrice: amount(999999999),
  discountPct: amount(100),
  validated: z.boolean(),
  notes: text(2000).optional().default(""),
  manufacturer: text(100).optional().default(""),
  supplierRef: text(100).optional().default(""),
  supplier: text(100).optional().default(""),
});

export type ConceptInput = z.input<typeof conceptInput>;
