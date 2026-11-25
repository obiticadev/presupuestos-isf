// Expands a kit into the quantities of its lines. Pure: the quote service supplies the concepts.
import { Prisma } from "@/generated/prisma/browser";
import type { Decimal } from "@/lib/decimal";
import { parseDecimalEs } from "@/lib/decimal";
import { allowedTemplates, partKey, refCategoryId, refConceptId, slotLineKey, type KitDefinition, type KitRef, type KitSlot, type SlotType } from "./definition";

export type ConceptForKit = {
  id: string; categoryId: string; description: string; unitName: string; salePrice: Decimal | null;
  taxName: string; taxRatePct: Decimal; active: boolean;
};
export type KitInput = { quantity: string; params: Record<string, string>; choices: Record<string, string>; slots?: KitSlot[] };
export type KitExpansion = { lines: { slot: string; conceptId: string; quantity: Decimal }[]; missing: string[] };

/** Where a draft keeps its own measure for a fixed material (FIXED / PER_QTY): the kit's copy stays untouched. */
export const overrideKey = (slot: string) => `k_${slot}`;

const ONE = new Prisma.Decimal(1);

export const isVariant = (t: SlotType, c: ConceptForKit): boolean =>
  "conceptIds" in t.variants ? t.variants.conceptIds.includes(c.id) : c.categoryId === t.variants.categoryId;

/** A slot's type: the kit's own ("self") or the one in the copy of the dynamic chosen for `group`. */
export function slotTypeOf(def: KitDefinition, choices: Record<string, string>, group: string, type: string): SlotType | undefined {
  const types = group === "self" ? def.slotTypes : def.dynamics?.find((d) => d.slot === group)?.copies?.[choices[group]]?.definition.slotTypes;
  return types?.find((t) => t.key === type);
}

const num = (s: string | undefined) => {
  const n = parseDecimalEs(s ?? "");
  return n === null ? null : new Prisma.Decimal(n);
};

/**
 * Main line (slot "main", quantity N) plus one line per component: FIXED k, PER_QTY k × N, PER_QTY_AND_PARAM k × N × data, PARAM k × data.
 * Anything missing leaves the whole kit unvalued (lines = []): a pump is never priced without its hose.
 * `descriptive` (a global-price subsection): the lines carry no price, so a concept without sale price is valid.
 */
export function expandKit(def: KitDefinition, input: KitInput, concepts: Map<string, ConceptForKit>, descriptive = false): KitExpansion {
  const missing: string[] = [];
  // A dynamic without a main counts as one unit: the UI sends "1" and it is not asked.
  const n = def.main ? num(input.quantity) : ONE;
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
  const resolve = (slot: string, ref: KitRef | KitDefinition["components"][number]["ref"], label: string, required: boolean): string | null => {
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

  // The kit itself (prefix "") or a placed dynamic (prefix "d1", N = 1): main, then components.
  const expandPart = (part: KitDefinition, prefix: string, n: Decimal | null) => {
    const key = (slot: string) => (prefix ? partKey(prefix, slot) : slot);
    const mainId = part.main ? resolve(key("main"), part.main, part.main.label, true) : null;
    if (mainId && n) lines.push({ slot: key("main"), conceptId: mainId, quantity: n });

    for (const c of part.components) {
      const id = resolve(key(c.slot), c.ref, c.label, c.required);
      if (!id || !n) continue;
      let k = new Prisma.Decimal(c.formula.k);
      const own = (input.params[overrideKey(key(c.slot))] ?? "").trim();
      if (own && (c.formula.type === "FIXED" || c.formula.type === "PER_QTY")) {
        const v = num(own);
        if (!v || v.lt(0)) { missing.push(`${c.label}: medida no válida`); continue; }
        k = v;
      }
      let q: Decimal;
      if (c.formula.type === "FIXED") q = k;
      else if (c.formula.type === "PER_QTY") q = k.mul(n);
      else {
        const v = values.get(c.formula.param);
        if (!v) continue; // an optional datum left empty: the component does not apply
        q = c.formula.type === "PARAM" ? k.mul(v) : k.mul(n).mul(v);
      }
      if (q.gt(0)) lines.push({ slot: key(c.slot), conceptId: id, quantity: q });
    }
  };

  // Slots in the order of their types, then in the order they were added; a slot of an unknown type is ignored.
  const expandSlots = (types: SlotType[], group: string) => {
    const own = (input.slots ?? []).filter((s) => s.group === group);
    for (const t of types) for (const s of own.filter((x) => x.type === t.key)) {
      if (!s.conceptId) { missing.push(`Falta elegir la variante en ${t.label}`); continue; }
      const q = num(s.quantity);
      if (!q || !q.gt(0)) { missing.push(`${t.label}: cantidad no válida`); continue; }
      const c = concepts.get(s.conceptId);
      if (c && !isVariant(t, c)) { missing.push(`${t.label}: ${c.description} no es una variante válida`); continue; }
      if (!c || !c.active || (c.salePrice === null && !descriptive)) { missing.push(`${t.label} ya no está disponible`); continue; }
      lines.push({ slot: slotLineKey(group, s.id), conceptId: c.id, quantity: q });
    }
  };

  expandPart(def, "", n);
  for (const d of def.dynamics ?? []) {
    const chosen = input.choices[d.slot];
    if (!chosen || !allowedTemplates(d).includes(chosen)) {
      if (!d.optional) missing.push("templateId" in d.choice ? `Falta ${d.label}` : `Falta elegir ${d.label}`);
      continue;
    }
    const copy = d.copies?.[chosen];
    if (!copy) { missing.push(`${d.label} ya no está disponible`); continue; }
    expandPart(copy.definition, d.slot, ONE);
    expandSlots(copy.definition.slotTypes ?? [], d.slot);
  }
  expandSlots(def.slotTypes ?? [], "self");

  return missing.length ? { lines: [], missing } : { lines, missing };
}
