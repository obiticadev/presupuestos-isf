import { z } from "zod";

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

export const clientInput = z.object({
  legalName: text(200).min(1, "Escribe la razón social"),
  // Spec 5.4: format only (no check digit in v1). Spaces, dashes and dots are dropped so "a-28 000.000" = "A28000000".
  taxId: z.string().transform((s) => s.replace(/[\s.-]/g, "").toUpperCase()).pipe(
    z.string().min(1, "Escribe el CIF/NIF").max(20, "Máximo 20 caracteres").regex(/^[A-Z0-9]+$/, "Solo letras y números"),
  ),
  tradeName: text(200).optional().default(""),
  fiscalAddress: text(500).optional().default(""),
  notes: text(4000).optional().default(""),
  paymentTerms: text(4000).optional().default(""),
  exclusions: text(8000).optional().default(""),
  offerValidityDays: z.string().optional().transform((v, ctx) => {
    const s = (v ?? "").trim();
    if (!s) return null;
    if (!/^\d+$/.test(s) || Number(s) < 1 || Number(s) > 365) {
      ctx.addIssue({ code: "custom", message: "Entre 1 y 365 días, o vacío para usar el valor por defecto" });
      return z.NEVER;
    }
    return Number(s);
  }),
});
export type ClientInput = z.input<typeof clientInput>;

export const contactInput = z.object({
  id: z.string().optional(),
  name: text(100).min(1, "Escribe el nombre"),
  role: text(100).optional().default(""),
  email: z.string().trim().pipe(z.union([z.literal(""), z.email("Email no válido")])),
  phone: text(50).optional().default(""),
});
export type ContactInput = z.input<typeof contactInput>;

export const locationInput = z.object({
  id: z.string().optional(),
  name: text(100).min(1, "Escribe el nombre"),
  address: text(300).optional().default(""),
  installation: text(100).optional().default(""),
  country: text(100).optional().default(""),
});
export type LocationInput = z.input<typeof locationInput>;
