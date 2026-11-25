import { z } from "zod";
import { parseIsoDate } from "@/lib/dates";
import { decimalField, optionalDecimalField } from "@/lib/decimal-field";

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);
/** Titles and descriptions are one line: a pasted line break becomes a space (the PDF would join them anyway). */
const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, " ");
const optionalId = z.string().optional().transform((s) => (s ? s : null));

/** Every header field is optional: the editor saves one block at a time. */
export const headerInput = z.object({
  clientId: z.string().min(1, "Elige un cliente"),
  typeId: optionalId,
  locationId: optionalId,
  contactId: optionalId,
  ownerId: z.string().min(1),
  date: z.string().transform((s, ctx) => {
    const d = parseIsoDate(s);
    if (!d) { ctx.addIssue({ code: "custom", message: "Fecha no válida" }); return z.NEVER; }
    return d;
  }),
  subject: text(2000),
  paymentTerms: text(4000),
  exclusions: text(8000),
  validityDays: z.coerce.number({ message: "Escribe un número de días" }).int("Días enteros").min(1, "Entre 1 y 365 días").max(365, "Entre 1 y 365 días"),
}).partial();
export type HeaderInput = z.input<typeof headerInput>;

export const noteInput = z.object({ text: text(1000).min(1, "Escribe la nota") });

export const sectionInput = z.object({
  title: text(300).transform(oneLine).optional(),
  mode: z.enum(["SUM", "GLOBAL"]).optional(),
  globalQty: optionalDecimalField(),
  globalPrice: optionalDecimalField(),
  taxId: z.string().optional(),
  showTotal: z.boolean().optional(),
});
export type SectionInput = z.input<typeof sectionInput>;

export const catalogLineInput = z.object({ conceptId: z.string().min(1, "Elige un concepto"), quantity: decimalField() });
export type CatalogLineInput = z.input<typeof catalogLineInput>;

export const customLineInput = z.object({
  description: text(2000).min(1, "Escribe la descripción").transform(oneLine),
  unitName: text(20),
  quantity: decimalField(),
  unitPrice: optionalDecimalField(),
  taxId: z.string().optional(),
});
export type CustomLineInput = z.input<typeof customLineInput>;

export const lineUpdateInput = z.object({
  description: text(2000).min(1, "Escribe la descripción").transform(oneLine).optional(),
  // Empty or missing means "unchanged": a quantity cannot be cleared.
  quantity: optionalDecimalField(),
  visible: z.boolean().optional(),
  showQuantity: z.boolean().optional(),
});
export type LineUpdateInput = z.input<typeof lineUpdateInput>;

export const priceAdjustInput = z.object({
  newPrice: decimalField(),
  reason: text(300).min(1, "Escribe el motivo del ajuste"),
});
export type PriceAdjustInput = z.input<typeof priceAdjustInput>;

export const kitInstanceInput = z.object({
  quantity: decimalField(),
  params: z.record(z.string(), z.string()).default({}),
  choices: z.record(z.string(), z.string()).default({}),
});
export type KitInstanceInput = z.input<typeof kitInstanceInput>;

/** A comment on a line, a kit or a partida/subpartida: an empty one removes it. */
export const commentInput = z.object({ kind: z.enum(["line", "kit", "section"]), id: z.string().min(1), comment: text(2000) });
export type CommentInput = z.input<typeof commentInput>;

export const LOCKED = "El presupuesto ya está emitido y no se puede modificar";
