import { z } from "zod";
import { Prisma } from "@/generated/prisma/browser";
import { parseDecimalEs } from "@/lib/decimal";

// A kit template: a main concept with quantity N, named numeric data and components whose quantity
// comes from a closed set of formulas (spec 5.3). Adding a formula type is a code change with tests.

/** A positive decimal typed the Spanish way, kept as a normalised string ("1,5" → "1.5"). */
const factor = z.string().transform((value, ctx) => {
  const n = parseDecimalEs(value);
  if (n === null || !new Prisma.Decimal(n).gt(0)) {
    ctx.addIssue({ code: "custom", message: "Escribe un número mayor que cero" });
    return z.NEVER;
  }
  return n;
});

const label = z.string().trim().min(1, "Escribe el nombre").max(300, "Máximo 300 caracteres");
const ref = z.union([
  z.object({ conceptId: z.string().min(1, "Elige un concepto") }).strict(),
  z.object({ categoryId: z.string().min(1, "Elige una categoría") }).strict(),
]);

const formula = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FIXED"), k: factor }),
  z.object({ type: z.literal("PER_QTY"), k: factor }),
  z.object({ type: z.literal("PER_QTY_AND_PARAM"), param: z.string().min(1, "Elige el dato"), k: factor }),
  z.object({ type: z.literal("PARAM"), param: z.string().min(1, "Elige el dato"), k: factor }),
]);

export const kitDefinition = z.object({
  main: z.intersection(ref, z.object({ label, symbol: z.string().max(2).optional() })),
  params: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/, "Clave en minúsculas, sin espacios"),
    label, unit: z.string().trim().max(20, "Máximo 20 caracteres"), required: z.boolean(),
  })).max(20),
  components: z.array(z.object({
    slot: z.string().regex(/^c\d+$/), label, ref, required: z.boolean(), formula, inName: z.boolean().optional(),
  })).max(30),
}).superRefine((def, ctx) => {
  const keys = def.params.map((p) => p.key);
  keys.forEach((k, i) => {
    if (keys.indexOf(k) !== i) ctx.addIssue({ code: "custom", path: ["params", i, "key"], message: "Clave repetida" });
  });
  const slots = def.components.map((c) => c.slot);
  def.components.forEach((c, i) => {
    if (slots.indexOf(c.slot) !== i) ctx.addIssue({ code: "custom", path: ["components", i, "slot"], message: "Hueco repetido" });
    if ((c.formula.type === "PER_QTY_AND_PARAM" || c.formula.type === "PARAM") && !keys.includes(c.formula.param))
      ctx.addIssue({ code: "custom", path: ["components", i, "formula", "param"], message: "Ese dato no existe en el conjunto" });
  });
});

export type KitDefinition = z.output<typeof kitDefinition>;
export type KitRef = KitDefinition["main"];
export type KitFormula = KitDefinition["components"][number]["formula"];

export const refConceptId = (r: { conceptId: string } | { categoryId: string }) => ("conceptId" in r ? r.conceptId : null);
export const refCategoryId = (r: { conceptId: string } | { categoryId: string }) => ("categoryId" in r ? r.categoryId : null);

/** The formula in words, for the template page and the editor: «1 × N × Distancia al cuadro». */
export function describeFormula(f: KitFormula, params: KitDefinition["params"]): string {
  const k = f.k.replace(".", ",");
  if (f.type === "FIXED") return k;
  if (f.type === "PER_QTY") return `${k} × N`;
  if (f.type === "PARAM") return `${k} × ${params.find((p) => p.key === f.param)?.label ?? f.param}`;
  return `${k} × N × ${params.find((p) => p.key === f.param)?.label ?? f.param}`;
}
