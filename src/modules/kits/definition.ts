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

const mainRef = z.intersection(ref, z.object({ label, symbol: z.string().max(2).optional() }));

const slotType = z.object({
  key: z.string().regex(/^t\d+$/),
  label,
  abbr: z.string().trim().min(1, "Escribe la abreviatura").max(4, "Máximo 4 caracteres"),
  red: z.boolean(),
  variants: z.union([
    z.object({ conceptIds: z.array(z.string().min(1)).min(1, "Añade al menos una variante").max(100) }).strict(),
    z.object({ categoryId: z.string().min(1, "Elige una categoría") }).strict(),
  ]),
});

const dynamicPart = z.object({
  slot: z.string().regex(/^d\d+$/),
  label,
  choice: z.union([
    z.object({ templateId: z.string().min(1, "Elige el conjunto dinámico") }).strict(),
    z.object({ templateIds: z.array(z.string().min(1)).min(2, "Elige al menos dos") }).strict(),
  ]),
  optional: z.boolean(),
  inName: z.boolean().optional(),
  // Only in an instance's copy, never in a template: the dynamics' definitions when the kit was added.
  get copies() { return z.record(z.string(), z.object({ name: z.string(), definition: kitDefinition })).optional(); },
});

export const kitDefinition = z.object({
  // Absent in older definitions, which must parse back unchanged: no kind = normal, no list = empty.
  kind: z.enum(["normal", "dynamic"]).optional(),
  main: mainRef.optional(),
  params: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/, "Clave en minúsculas, sin espacios"),
    label, unit: z.string().trim().max(20, "Máximo 20 caracteres"), required: z.boolean(),
  })).max(20),
  components: z.array(z.object({
    slot: z.string().regex(/^c\d+$/), label, ref, required: z.boolean(), formula, inName: z.boolean().optional(),
  })).max(30),
  slotTypes: z.array(slotType).max(20).optional(),
  get dynamics() { return z.array(dynamicPart).max(5).optional(); },
}).superRefine((def, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const slotTypes = def.slotTypes ?? [];
  const dynamics = def.dynamics ?? [];
  if (def.kind !== "dynamic") {
    if (!def.main) issue(["main"], "Elige el principal");
    if (slotTypes.length) issue(["slotTypes"], "Solo los conjuntos dinámicos tienen slots");
  } else {
    if (!slotTypes.length) issue(["slotTypes"], "Añade al menos un tipo de slot");
    if (def.params.length) issue(["params"], "Un conjunto dinámico no pide datos");
    if (dynamics.length) issue(["dynamics"], "Un conjunto dinámico no puede llevar otro");
  }
  const keys = def.params.map((p) => p.key);
  keys.forEach((k, i) => {
    if (keys.indexOf(k) !== i) issue(["params", i, "key"], "Clave repetida");
  });
  const slots = def.components.map((c) => c.slot);
  def.components.forEach((c, i) => {
    if (slots.indexOf(c.slot) !== i) issue(["components", i, "slot"], "Hueco repetido");
    if ((c.formula.type === "PER_QTY_AND_PARAM" || c.formula.type === "PARAM") && !keys.includes(c.formula.param))
      issue(["components", i, "formula", "param"], "Ese dato no existe en el conjunto");
  });
  const types = slotTypes.map((t) => t.key);
  types.forEach((k, i) => { if (types.indexOf(k) !== i) issue(["slotTypes", i, "key"], "Tipo repetido"); });
  const parts = dynamics.map((d) => d.slot);
  parts.forEach((k, i) => { if (parts.indexOf(k) !== i) issue(["dynamics", i, "slot"], "Hueco repetido"); });
});

export type KitDefinition = z.output<typeof kitDefinition>;
export type SlotType = z.output<typeof slotType>;
export type DynamicPart = z.output<typeof dynamicPart>;

export const kitSlotList = z.array(z.object({
  id: z.string().min(1), group: z.string().min(1), type: z.string().min(1), conceptId: z.string().nullable(), quantity: z.string(),
}));
export type KitSlot = z.output<typeof kitSlotList>[number];

export const allowedTemplates = (d: DynamicPart): string[] => ("templateId" in d.choice ? [d.choice.templateId] : d.choice.templateIds);
export const isDynamic = (def: KitDefinition): boolean => def.kind === "dynamic";
export const slotLineKey = (group: string, slotId: string): string => (group === "self" ? `s:${slotId}` : `${group}/s:${slotId}`);
export const partKey = (group: string, slot: string): string => `${group}/${slot}`;

export type KitRef = NonNullable<KitDefinition["main"]>;
export type KitFormula = KitDefinition["components"][number]["formula"];

export const refConceptId = (r?: { conceptId: string } | { categoryId: string }) => (r && "conceptId" in r ? r.conceptId : null);
export const refCategoryId = (r?: { conceptId: string } | { categoryId: string }) => (r && "categoryId" in r ? r.categoryId : null);

/** The formula in words, for the template page and the editor: «1 × N × Distancia al cuadro». */
export function describeFormula(f: KitFormula, params: KitDefinition["params"]): string {
  const k = f.k.replace(".", ",");
  if (f.type === "FIXED") return k;
  if (f.type === "PER_QTY") return `${k} × N`;
  if (f.type === "PARAM") return `${k} × ${params.find((p) => p.key === f.param)?.label ?? f.param}`;
  return `${k} × N × ${params.find((p) => p.key === f.param)?.label ?? f.param}`;
}
