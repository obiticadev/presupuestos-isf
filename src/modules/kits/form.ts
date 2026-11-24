// The kit form (spec 5.2): materials hanging from a main element, translated to and from the stored KitDefinition.
import type { KitDefinition } from "./definition";
import { matchesAutoName } from "./naming";

export type FormRef = { kind: "categoryId" | "conceptId"; id: string };
/** `qty` is the text typed the Spanish way; `ask` = the quantity is typed in when quoting; `mult` = × the main quantity. */
export type FormMaterial = { slot: string; ref: FormRef; qty: string; mult: boolean; ask: boolean; required: boolean; inName: boolean };
export type RefInfo = (ref: FormRef) => { label: string; unit: string; prefix: string };

type StoredRef = { conceptId: string } | { categoryId: string };
const toRef = (r: StoredRef): FormRef => ("conceptId" in r ? { kind: "conceptId", id: r.conceptId } : { kind: "categoryId", id: r.categoryId });
const fromRef = (r: FormRef): StoredRef => (r.kind === "conceptId" ? { conceptId: r.id } : { categoryId: r.id });

/** «Obligatorio» only matters when something is chosen or typed in when quoting: a fixed article always goes in. */
export const showsRequired = (m: FormMaterial) => m.ref.kind === "categoryId" || m.ask;

// Old definitions: a k other than 1 in PER_QTY_AND_PARAM and data shared by several components are lost (none in production).
export function fromDefinition(def: KitDefinition): { main: FormRef; materials: FormMaterial[] } {
  const legacy = def.components.every((c) => c.inName === undefined);
  return {
    main: toRef(def.main),
    materials: def.components.map((c, i) => {
      const ask = c.formula.type === "PER_QTY_AND_PARAM" || c.formula.type === "PARAM";
      return {
        slot: c.slot, ref: toRef(c.ref), qty: ask ? "" : c.formula.k.replace(".", ","),
        mult: c.formula.type === "PER_QTY" || c.formula.type === "PER_QTY_AND_PARAM", ask,
        required: c.required, inName: legacy ? i === 0 : !!c.inName,
      };
    }),
  };
}

/** Labels come from the catalogue; each material typed in when quoting gets its own datum `q_<slot>`. */
export function toDefinition(main: FormRef, materials: FormMaterial[], info: RefInfo): KitDefinition {
  return {
    main: { ...fromRef(main), label: info(main).label },
    params: materials.filter((m) => m.ask).map((m) => {
      const { label, unit } = info(m.ref);
      return { key: `q_${m.slot}`, label: `${label}: cantidad`, unit, required: m.required };
    }),
    components: materials.map((m) => {
      const param = `q_${m.slot}`;
      const k = m.qty.trim().replace(",", ".");
      const formula: KitDefinition["components"][number]["formula"] = m.ask
        ? m.mult ? { type: "PER_QTY_AND_PARAM", param, k: "1" } : { type: "PARAM", param, k: "1" }
        : m.mult ? { type: "PER_QTY", k } : { type: "FIXED", k };
      return { slot: m.slot, label: info(m.ref).label, ref: fromRef(m.ref), required: showsRequired(m) ? m.required : true, formula, inName: m.inName };
    }),
  };
}

export function materialSummary(m: FormMaterial, unit: string): string {
  const how = m.ask ? "cantidad al presupuestar" : `${m.qty.trim() || "?"} ${unit}`.trim();
  return `${how} ${m.mult ? "× principal" : "en total"}`;
}

/** A kit whose name is not the automatic one keeps it at the front of the description (spec 5.7). */
export function legacyDescription(name: string, base: string, description: string): string {
  if (matchesAutoName(name, base)) return description;
  return description ? `${name}. ${description}` : name;
}
