// Expands a kit into the quantities of its lines. Pure: the quote service supplies the concepts.
import { Prisma } from "@/generated/prisma/browser";
import type { Decimal } from "@/lib/decimal";
import { parseDecimalEs } from "@/lib/decimal";
import { refCategoryId, refConceptId, type KitDefinition } from "./definition";

export type ConceptForKit = {
  id: string; categoryId: string; description: string; unitName: string; salePrice: Decimal | null;
  taxName: string; taxRatePct: Decimal; active: boolean;
};
export type KitInput = { quantity: string; params: Record<string, string>; choices: Record<string, string> };
export type KitExpansion = { lines: { slot: string; conceptId: string; quantity: Decimal }[]; missing: string[] };

const num = (s: string | undefined) => {
  const n = parseDecimalEs(s ?? "");
  return n === null ? null : new Prisma.Decimal(n);
};

/**
 * Main line (slot "main", quantity N) plus one line per component: FIXED k, PER_QTY k × N, PER_QTY_AND_PARAM k × N × data.
 * Anything missing leaves the whole kit unvalued (lines = []): a pump is never priced without its hose.
 * `descriptive` (a global-price subsection): the lines carry no price, so a concept without sale price is valid.
 */
export function expandKit(def: KitDefinition, input: KitInput, concepts: Map<string, ConceptForKit>, descriptive = false): KitExpansion {
  const missing: string[] = [];
  const n = num(input.quantity);
  if (!n || !n.gt(0)) missing.push("La cantidad debe ser mayor que cero");

  const values = new Map<string, Decimal>();
  for (const p of def.params) {
    const raw = (input.params[p.key] ?? "").trim();
    if (!raw) {
      if (p.required) missing.push(`Falta el dato ${p.label}`);
      continue;
    }
    const v = num(raw);
    if (!v || v.lt(0)) missing.push(`${p.label} no es un número válido`);
    else values.set(p.key, v);
  }

  const lines: KitExpansion["lines"] = [];
  const resolve = (slot: string, ref: KitDefinition["main"] | KitDefinition["components"][number]["ref"], label: string, required: boolean): string | null => {
    const id = refConceptId(ref) ?? input.choices[slot];
    if (!id) {
      if (required) missing.push(`Falta elegir ${label}`);
      return null;
    }
    const c = concepts.get(id);
    if (!c || !c.active || (c.salePrice === null && !descriptive)) {
      missing.push(`${label} ya no está disponible`);
      return null;
    }
    const category = refCategoryId(ref);
    if (category && c.categoryId !== category) {
      missing.push(`${label}: ${c.description} no es de la categoría indicada`);
      return null;
    }
    return id;
  };

  const mainId = resolve("main", def.main, def.main.label, true);
  if (mainId && n) lines.push({ slot: "main", conceptId: mainId, quantity: n });

  for (const c of def.components) {
    const id = resolve(c.slot, c.ref, c.label, c.required);
    if (!id || !n) continue;
    const k = new Prisma.Decimal(c.formula.k);
    let q: Decimal;
    if (c.formula.type === "FIXED") q = k;
    else if (c.formula.type === "PER_QTY") q = k.mul(n);
    else {
      const v = values.get(c.formula.param);
      if (!v) continue; // an optional datum left empty: the component does not apply
      q = k.mul(n).mul(v);
    }
    if (q.gt(0)) lines.push({ slot: c.slot, conceptId: id, quantity: q });
  }

  return missing.length ? { lines: [], missing } : { lines, missing };
}
