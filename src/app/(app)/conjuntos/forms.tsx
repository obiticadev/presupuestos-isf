"use client";

import { useRouter } from "next/navigation";
import { Combobox } from "@/components/combobox";
import { startTransition, useActionState, useEffect, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { saveKitAction, setKitActiveAction, type SaveKitResult } from "@/modules/kits/actions";
import { fromDefinition, isLegacyDefinition, legacyDescription, materialSummary, showsRequired, toDefinition, type FormMaterial, type FormRef, type RefInfo } from "@/modules/kits/form";
import { categoryPrefix, codePrefix, kitBaseName, uniqueName } from "@/modules/kits/naming";
import type { Kit } from "@/modules/kits/service";

type ConceptOption = { id: string; code: string; description: string; unitName: string; active: boolean; categoryId: string };
type CategoryOption = { id: string; name: string; active: boolean };

const errorsOf = (s: ActionResult | null) => (s && !s.ok ? s.errors : {});
const Err = ({ msg }: { msg?: string }) => (msg ? <span className="kt-err" role="alert">{msg}</span> : null);
const conceptText = (c: ConceptOption) => `${c.code} · ${c.description}`;
const nextSlot = (used: string[]) => {
  let n = 1;
  while (used.includes(`c${n}`)) n++;
  return `c${n}`;
};

/** «Se elige al presupuestar» (a category) or «Siempre el mismo» (an article, found with the Combobox). */
function RefPicker({ value, onChange, categories, concepts, error }: {
  value: FormRef; onChange: (r: FormRef) => void; categories: CategoryOption[]; concepts: ConceptOption[]; error?: string;
}) {
  const pick = (kind: FormRef["kind"]) => { if (kind !== value.kind) onChange({ kind, id: "" }); };
  // The active articles plus the one already named, even if deactivated; the category goes in the third column.
  const items = concepts.filter((c) => c.active || c.id === value.id).map((c) => ({
    id: c.id, code: c.code, description: c.description,
    extra: `${categories.find((k) => k.id === c.categoryId)?.name ?? ""}${c.active ? "" : " (desactivado)"}`,
  }));
  return (
    <>
      <div className="kt-seg" role="group" aria-label="Cómo se elige">
        <button type="button" aria-pressed={value.kind === "categoryId"} onClick={() => pick("categoryId")}>Se elige al presupuestar</button>
        <button type="button" aria-pressed={value.kind === "conceptId"} onClick={() => pick("conceptId")}>Siempre el mismo</button>
      </div>
      {value.kind === "categoryId" ? (
        <label className="kt-fl">De la categoría
          <select className="kt-in" value={value.id} onChange={(e) => onChange({ kind: "categoryId", id: e.target.value })} aria-invalid={!!error}>
            <option value="" disabled>Elige…</option>
            {categories.filter((c) => c.active || c.id === value.id).map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (desactivada)"}</option>)}
          </select>
          <Err msg={error} />
        </label>
      ) : (
        <label className="kt-fl">Artículo del catálogo
          <Combobox items={items} value={value.id} onPick={(id) => onChange({ kind: "conceptId", id })} invalid={!!error}
            placeholder="Escribe el código, la descripción o la categoría" label="Artículo del catálogo" />
          <Err msg={error} />
        </label>
      )}
    </>
  );
}

export function KitForm({ kit, concepts, categories, taken }: { kit: Kit | null; concepts: ConceptOption[]; categories: CategoryOption[]; taken: string[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SaveKitResult | null, FormData>(saveKitAction, null);
  const e = errorsOf(state);
  const errAt = (prefix: string) => Object.entries(e).find(([k]) => k.startsWith(prefix))?.[1];

  const info: RefInfo = (r) => {
    if (r.kind === "categoryId") {
      const c = categories.find((x) => x.id === r.id);
      return { label: c?.name ?? "Sin elegir", unit: "", prefix: c ? categoryPrefix(c.name) : "" };
    }
    const c = concepts.find((x) => x.id === r.id);
    return { label: c?.description ?? "Sin elegir", unit: c?.unitName ?? "", prefix: c ? codePrefix(c.code) : "" };
  };
  const baseOf = (main: FormRef, materials: FormMaterial[]) => kitBaseName(info(main).prefix, materials.filter((m) => m.inName).map((m) => info(m.ref).prefix));

  const [initial] = useState(() => (kit ? fromDefinition(kit.definition) : { main: { kind: "categoryId" as const, id: "" }, materials: [] }));
  const [main, setMain] = useState<FormRef>(initial.main);
  const [materials, setMaterials] = useState<FormMaterial[]>(initial.materials);
  const [sel, setSel] = useState(0);
  const [description] = useState(() => (kit ? legacyDescription(kit.name, baseOf(initial.main, initial.materials), kit.description, isLegacyDefinition(kit.definition)) : ""));

  useEffect(() => {
    if (state?.ok && state.id && state.id !== kit?.id) router.replace(`/conjuntos/${state.id}`);
  }, [state, kit?.id, router]);

  const base = baseOf(main, materials);
  const name = uniqueName(base, taken);
  const clash = taken.includes(base);
  const nextUnmarked = materials.findIndex((m) => !m.inName && info(m.ref).prefix);
  const cur = materials[sel];
  const set = (i: number, p: Partial<FormMaterial>) => setMaterials(materials.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const add = () => {
    setMaterials([...materials, { slot: nextSlot(materials.map((m) => m.slot)), ref: { kind: "categoryId", id: "" }, qty: "1", mult: true, ask: false, required: true, inName: materials.length === 0 }]);
    setSel(materials.length);
  };
  const remove = (i: number) => { setMaterials(materials.filter((_, j) => j !== i)); setSel(Math.max(0, Math.min(sel, materials.length - 2))); };

  return (
    <form
      onSubmit={(ev) => { ev.preventDefault(); const data = new FormData(ev.currentTarget); startTransition(() => action(data)); }}
      style={{ marginTop: 4 }}
    >
      {kit && <input type="hidden" name="id" value={kit.id} />}
      <input type="hidden" name="definition" value={JSON.stringify(toDefinition(main, materials, info))} />

      <div className="kt-id">
        <h1 className="kt-name"><u>{name.slice(0, 2)}</u>{name.slice(2)}</h1>
        <span className="mini" aria-hidden><i>{name.slice(0, 2)}</i>{materials.map((m) => <s key={m.slot} />)}</span>
      </div>
      <p className="kt-note">Nombre automático: prefijo del principal + los materiales marcados «en el nombre». Las 2 letras subrayadas van en el símbolo.</p>
      {clash && (
        <div className="kt-clash" role="status">
          Ya existe un conjunto {base}.
          {nextUnmarked >= 0 && (
            <><button type="button" onClick={() => set(nextUnmarked, { inName: true })}>
              Añadir {info(materials[nextUnmarked].ref).prefix} al nombre → {kitBaseName(base, [info(materials[nextUnmarked].ref).prefix])}
            </button> o</>
          )}
          se guardará como <b>{name}</b>.
        </div>
      )}

      <label className="kt-fl" style={{ maxWidth: 720, marginTop: 12 }}>Descripción
        <textarea className="kt-in" name="description" defaultValue={description} rows={2} maxLength={2000} />
        <Err msg={e.description} />
      </label>

      <div className="kt-layout">
        <div>
          <div className="kt-root">
            <span className="t">Principal</span>
            <div className="kt-rgrid">
              <div style={{ display: "grid", gap: 10 }}>
                <RefPicker key={`main-${main.kind}`} value={main} onChange={setMain} categories={categories} concepts={concepts} error={errAt("definition.main")} />
              </div>
              <div className="kt-fl">Cantidad<div className="kt-fixed">Se pide al presupuestar</div></div>
            </div>
          </div>
          <div className="kt-bus">
            {materials.map((m, i) => {
              const it = info(m.ref);
              const bad = !!errAt(`definition.components.${i}.`);
              return (
                <div className="kt-row" key={m.slot}>
                  <button type="button" className={`kt-dep${bad ? " bad" : ""}`} aria-pressed={i === sel} onClick={() => setSel(i)}>
                    <span>
                      {it.prefix && <span className={`kt-pf${m.inName ? "" : " off"}`}>{it.prefix}</span>}
                      <b className={m.ref.id ? undefined : "mut"}>{it.label}</b>
                      <small>
                        {m.ref.kind === "categoryId" ? (m.ref.id ? `se elige de «${it.label}» al presupuestar` : "categoría sin elegir")
                          : m.ref.id ? conceptText(concepts.find((c) => c.id === m.ref.id)!) : "artículo sin elegir"}
                        {showsRequired(m) && !m.required ? " · opcional" : ""}
                      </small>
                    </span>
                    <span className="kt-sum">{materialSummary(m, it.unit)}</span>
                    <span className="kt-chev" aria-hidden>{i === sel ? "⌄" : "›"}</span>
                  </button>
                </div>
              );
            })}
            <div className="kt-row"><button type="button" className="kt-add" onClick={add}>+ Añadir material</button></div>
          </div>
        </div>

        <div className="kt-panel">
          {!cur ? <p className="mut">Añade un material para editarlo.</p> : (
            <>
              <h3>Material: {info(cur.ref).label}</h3>
              <div style={{ display: "grid", gap: 10 }}>
                <RefPicker key={`${cur.slot}-${cur.ref.kind}`} value={cur.ref} onChange={(ref) => set(sel, { ref })} categories={categories} concepts={concepts} error={errAt(`definition.components.${sel}.ref`)} />
              </div>
              <label className="kt-erow"><span>Cantidad</span>
                <span className="kt-qty">
                  <input className="kt-in num" inputMode="decimal" value={cur.ask ? "" : cur.qty} disabled={cur.ask} placeholder={cur.ask ? "—" : undefined}
                    aria-invalid={!!errAt(`definition.components.${sel}.formula`)} onChange={(ev) => set(sel, { qty: ev.target.value })} />
                  <span className="kt-unit">{info(cur.ref).unit}</span>
                </span>
              </label>
              <Err msg={errAt(`definition.components.${sel}.formula`)} />
              <label className="kt-erow"><span>Se pone al presupuestar</span>
                <span><input type="checkbox" className="kt-ck" checked={cur.ask} onChange={(ev) => set(sel, { ask: ev.target.checked })} /></span>
              </label>
              <label className="kt-erow"><span>× cantidad del principal</span>
                <span><input type="checkbox" role="switch" className="kt-sw" checked={cur.mult} onChange={(ev) => set(sel, { mult: ev.target.checked })} /></span>
              </label>
              <p className="kt-hint">{cur.mult ? "Si el principal lleva 2, esto se multiplica por 2." : "Va una sola vez, lleve el principal lo que lleve."}</p>
              {showsRequired(cur) && (
                <label className="kt-erow"><span>Obligatorio</span>
                  <span><input type="checkbox" className="kt-ck" checked={cur.required} onChange={(ev) => set(sel, { required: ev.target.checked })} /></span>
                </label>
              )}
              <label className="kt-erow"><span>En el nombre{info(cur.ref).prefix ? ` (${info(cur.ref).prefix})` : ""}</span>
                <span><input type="checkbox" className="kt-ck" checked={cur.inName} onChange={(ev) => set(sel, { inName: ev.target.checked })} /></span>
              </label>
              <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={() => remove(sel)}>Quitar material</button>
            </>
          )}
        </div>
      </div>

      <div className="kt-foot">
        <button className="btn pri" disabled={pending}>Guardar</button>
        <span className="mut" style={{ fontSize: 12 }}>Cambiar el conjunto no altera los presupuestos donde ya se usó.</span>
        {state?.ok && <span className="mut" role="status">Guardado</span>}
        {Object.keys(e).length > 0 && <span className="err" role="alert">{e._ ?? e.name ?? "Revisa los campos marcados"}</span>}
      </div>
    </form>
  );
}

export function KitActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setKitActiveAction, null);
  return (
    <form action={action} style={{ marginTop: 22, paddingTop: 14, borderTop: "1px solid var(--rule)", display: "flex", gap: 10, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <button className={active ? "btn warn" : "btn"} disabled={pending}>{active ? "Desactivar" : "Reactivar"}</button>
      {errorsOf(state)._ && <span className="err" role="alert">{errorsOf(state)._}</span>}
      <span className="mut" style={{ fontSize: 12 }}>Un conjunto desactivado no se ofrece en presupuestos nuevos.</span>
    </form>
  );
}
