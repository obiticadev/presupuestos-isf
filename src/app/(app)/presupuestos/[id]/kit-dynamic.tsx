// The dynamic parts of a kit in the draft tree (spec 2026-11-25 §4): a branch per placed dynamic, its slots and «Añadir slot».
// The tree sits inside the kit's update form, so these controls reach their own forms (KitSideForms) through the `form` attribute.
import type { ReactNode } from "react";
import { ActionForm, SubmitOnBlur } from "@/components/action-form";
import { Combobox } from "@/components/combobox";
import { Prisma } from "@/generated/prisma/browser";
import { formatDecimalEs } from "@/lib/decimal";
import { allowedTemplates, refConceptId, type DynamicPart, type KitDefinition, type KitSlot, type SlotType } from "@/modules/kits/definition";
import { isVariant } from "@/modules/kits/formulas";
import { codePrefix } from "@/modules/kits/naming";
import { addKitSlotAction, removeKitSlotAction, setKitDynamicAction, updateKitSlotAction } from "@/modules/quotes/actions";
import type { EditorContext } from "./sections";

type Ref = KitDefinition["components"][number]["ref"];
/** What KitBlock already knows how to draw: the article column of a part and its tag. */
export type TreeTools = {
  article: (slot: string, ref: Ref, label: string, required: boolean) => ReactNode;
  tagOf: (ref: Ref, label: string) => string;
  unitOf: (id: string | undefined) => string;
};

const fid = (kitId: string, what: string, key: string) => `${what}-${kitId}-${key.replace("/", "_")}`;
const qtyText = (v: string) => formatDecimalEs(v, { min: 0, max: 4 });

/** The slots of a group in the order of their types, then in the order they were added (as expandKit lines them up). */
export const groupSlots = (slots: KitSlot[], types: SlotType[], group: string) =>
  types.flatMap((t) => slots.filter((s) => s.group === group && s.type === t.key));

/** «N slots»: the units, not the rows (3 + 1 + 2 + 1 = 7). */
export function slotCount(slots: KitSlot[]): string {
  const n = slots.reduce((a, s) => a.plus(new Prisma.Decimal(s.quantity)), new Prisma.Decimal(0));
  return `${qtyText(n.toString())} slot${n.equals(1) ? "" : "s"}`;
}

/** A dynamic's own tag: the first two letters of its template's name. */
export const dynamicTag = (name: string) => codePrefix(name).slice(0, 2) || "DY";

/** The tree's left part: tag and label at level 1 or 2; `cont` keeps the level-1 vertical going past a level-2 row. */
function Node({ tag, tagClass, label, note, cont }: { tag: string; tagClass?: string; label: string; note?: string; cont?: boolean }) {
  return (
    <div className="kq-n">
      {cont && <i className="kq-v" aria-hidden />}
      <b><span className={`kq-tag${tagClass ? ` ${tagClass}` : ""}`}>{tag}</span><span className="kq-l" title={label}>{label}</span></b>
      {note && <em>{note}</em>}
    </div>
  );
}

function SlotRow({ ctx, kitId, slot, type, global, level, cont, focus }: {
  ctx: EditorContext; kitId: string; slot: KitSlot; type: SlotType; global: boolean; level: 1 | 2; cont: boolean; focus: boolean;
}) {
  const current = slot.conceptId ?? "";
  const items = ctx.allConcepts.filter((c) => isVariant(type, c) && ((c.active && (global || c.salePrice !== null)) || c.id === current))
    .map((c) => ({ id: c.id, code: c.code, description: `${c.description}${c.active ? "" : " (desactivado)"}`, extra: ctx.categories[c.categoryId] ?? "" }));
  const form = fid(kitId, "slot", slot.id);
  return (
    <div className={`kq-r${level === 2 ? " kq-r2" : ""}`}>
      <Node tag={type.abbr} tagClass={type.red ? "kq-red" : undefined} label={type.label} cont={cont} />
      <div className="kq-a">
        <Combobox key={current} items={items} value={current} name="conceptId" form={form} submit label={type.label} autoFocus={focus}
          placeholder={items.length ? "Elige la variante…" : "No hay variantes disponibles"} />
      </div>
      <SubmitOnBlur><div className="kq-m">
        <input name="quantity" form={form} defaultValue={qtyText(slot.quantity)} inputMode="decimal" required aria-label={`${type.label}: cantidad`} />
        <small>{ctx.allConcepts.find((c) => c.id === current)?.unitName ?? ""}</small>
        <button className="icon" form={fid(kitId, "rmslot", slot.id)} aria-label={`Quitar ${type.label}`} title="Quitar slot">✕</button>
      </div></SubmitOnBlur>
    </div>
  );
}

/** The last branch: one button per slot type. */
function AddSlotBar({ kitId, group, types, level, cont }: { kitId: string; group: string; types: SlotType[]; level: 1 | 2; cont?: boolean }) {
  return (
    <div className={`kq-r kq-last${level === 2 ? " kq-r2" : ""}`}>
      <div className="kq-n">{cont && <i className="kq-v" aria-hidden />}<span className="kq-addlab">Añadir slot</span></div>
      <div className="kq-add">
        {types.map((t) => (
          <button key={t.key} form={fid(kitId, "addslot", group)} name="type" value={t.key} className={t.red ? "kq-red" : undefined}>+ {t.label}</button>
        ))}
      </div>
    </div>
  );
}

/** The slots of a standalone dynamic, at level 1, and its «Añadir slot». */
export function OwnSlots({ ctx, kitId, def, slots, global, focusId }: { ctx: EditorContext; kitId: string; def: KitDefinition; slots: KitSlot[]; global: boolean; focusId?: string }) {
  const types = def.slotTypes ?? [];
  return (
    <>
      {groupSlots(slots, types, "self").map((s) => (
        <SlotRow key={s.id} ctx={ctx} kitId={kitId} slot={s} type={types.find((t) => t.key === s.type)!} global={global} level={1} cont={false} focus={s.id === focusId} />
      ))}
      <AddSlotBar kitId={kitId} group="self" types={types} level={1} />
    </>
  );
}

/** A dynamic of a normal kit: its level-1 row and, if placed, its fixed materials, its slots and «Añadir slot» at level 2. */
export function DynamicBranch({ ctx, kitId, d, choices, slots, global, last, tools, focusId }: {
  ctx: EditorContext; kitId: string; d: DynamicPart; choices: Record<string, string>; slots: KitSlot[]; global: boolean; last: boolean;
  tools: TreeTools; focusId?: string;
}) {
  const chosen = choices[d.slot];
  const copy = chosen ? d.copies?.[chosen] : undefined;
  const choose = !("templateId" in d.choice);
  const picker = (placeholder: string) => (
    <Combobox key={chosen ?? ""} items={allowedTemplates(d).filter((id) => d.copies?.[id] || id === chosen)
      .map((id) => ({ id, code: d.copies?.[id]?.name ?? id, description: ctx.kits.find((k) => k.id === id)?.description ?? "" }))}
    value={chosen ?? ""} name="templateId" form={fid(kitId, "setdyn", d.slot)} submit label={d.label} placeholder={placeholder} />
  );

  if (!copy) {
    // An optional dynamic taken out, or a required one still to choose.
    const fixedId = allowedTemplates(d)[0];
    return (
      <div className={`kq-r${last ? " kq-last" : ""}`}>
        <div className="kq-n"><b><span className="kq-tag kq-off">{dynamicTag(d.copies?.[fixedId]?.name ?? d.label)}</span><span className="kq-l mut" title={d.label}>{d.label}</span></b>{d.optional && <em>opcional</em>}</div>
        {choose ? <><div className="kq-a">{picker(d.optional ? `Añadir ${d.label.toLowerCase()}…` : "Elige…")}</div><div className="kq-m" /></>
          : <button className="kq-addpe" form={fid(kitId, "setdyn", d.slot)} name="templateId" value={fixedId}>+ Añadir {d.label.toLowerCase()}</button>}
      </div>
    );
  }

  const def = copy.definition;
  const types = def.slotTypes ?? [];
  const own = groupSlots(slots, types, d.slot);
  const mainId = def.main ? refConceptId(def.main) ?? choices[`${d.slot}/main`] : undefined;
  return (
    <>
      <div className={`kq-r kq-dy${last ? " kq-last" : ""}`}>
        <div className="kq-n">
          <i className="kq-v kq-v2" aria-hidden />
          <b><span className="kq-tag kq-pe">{dynamicTag(copy.name)}</span><span className="kq-l" title={d.label}>{d.label}</span></b>
          {d.optional && <em>opcional</em>}
        </div>
        <div className="kq-a">
          {choose ? picker("Elige…") : def.main ? tools.article(`${d.slot}/main`, def.main, def.main.label, true)
            : <span className="kq-ro" title={copy.name}>{copy.name}</span>}
        </div>
        <div className="kq-m">
          <input value="1" readOnly aria-label={`${d.label}: cantidad`} />
          <small>{slotCount(own)}</small>
          {d.optional ? <button className="icon" form={fid(kitId, "rmdyn", d.slot)} aria-label={`Quitar ${d.label}`} title={`Quitar ${d.label.toLowerCase()}`}>✕</button> : <span />}
        </div>
      </div>
      {choose && def.main && (
        <div className="kq-r kq-r2">
          <Node tag={tools.tagOf(def.main, def.main.label)} tagClass={refConceptId(def.main) ? undefined : "kq-el"} label="Principal" cont={!last} />
          <div className="kq-a">{tools.article(`${d.slot}/main`, def.main, def.main.label, true)}</div>
          <div className="kq-m"><input value="1" readOnly aria-label="Principal: cantidad" /><small>{tools.unitOf(mainId)}</small><span /></div>
        </div>
      )}
      {def.components.map((c) => {
        const id = refConceptId(c.ref) ?? choices[`${d.slot}/${c.slot}`];
        return (
          <div key={c.slot} className="kq-r kq-r2">
            <Node tag={tools.tagOf(c.ref, c.label)} tagClass={refConceptId(c.ref) ? undefined : "kq-el"} label={c.label} note={c.required ? undefined : "opcional"} cont={!last} />
            <div className="kq-a">{tools.article(`${d.slot}/${c.slot}`, c.ref, c.label, c.required)}</div>
            <div className="kq-m"><input value={qtyText(c.formula.k)} readOnly aria-label={`${c.label}: cantidad`} /><small>{tools.unitOf(id)}</small><span /></div>
          </div>
        );
      })}
      {own.map((s) => (
        <SlotRow key={s.id} ctx={ctx} kitId={kitId} slot={s} type={types.find((t) => t.key === s.type)!} global={global} level={2} cont={!last} focus={s.id === focusId} />
      ))}
      <AddSlotBar kitId={kitId} group={d.slot} types={types} level={2} cont={!last} />
    </>
  );
}

/** The forms the tree's dynamic controls submit to, outside the kit's update form (forms cannot nest). */
export function KitSideForms({ kitId, def, slots }: { kitId: string; def: KitDefinition; slots: KitSlot[] }) {
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  return (
    <div className="kq-side">
      {slots.map((s) => (
        <span key={s.id}>
          <ActionForm action={updateKitSlotAction} id={fid(kitId, "slot", s.id)}>{hidden("id", kitId)}{hidden("slotId", s.id)}</ActionForm>
          <ActionForm action={removeKitSlotAction} id={fid(kitId, "rmslot", s.id)}>{hidden("id", kitId)}{hidden("slotId", s.id)}</ActionForm>
        </span>
      ))}
      {["self", ...(def.dynamics ?? []).map((d) => d.slot)].map((g) => (
        <ActionForm key={g} action={addKitSlotAction} id={fid(kitId, "addslot", g)}>{hidden("id", kitId)}{hidden("group", g)}</ActionForm>
      ))}
      {(def.dynamics ?? []).map((d) => (
        <span key={d.slot}>
          <ActionForm action={setKitDynamicAction} id={fid(kitId, "setdyn", d.slot)}>{hidden("id", kitId)}{hidden("group", d.slot)}</ActionForm>
          <ActionForm action={setKitDynamicAction} id={fid(kitId, "rmdyn", d.slot)}>{hidden("id", kitId)}{hidden("group", d.slot)}{hidden("templateId", "")}</ActionForm>
        </span>
      ))}
    </div>
  );
}
