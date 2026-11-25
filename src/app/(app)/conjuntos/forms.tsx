"use client";

import { useRouter } from "next/navigation";
import { Combobox } from "@/components/combobox";
import { startTransition, useActionState, useEffect, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { saveKitAction, setKitActiveAction, type SaveKitResult } from "@/modules/kits/actions";
import { extrasFromDefinition, fromDefinition, isLegacyDefinition, legacyDescription, materialSummary, nextKey, showsRequired, toDefinition, type FormDynamic, type FormMaterial, type FormRef, type FormSlotType, type RefInfo } from "@/modules/kits/form";
import { categoryPrefix, codePrefix, kitBaseName, uniqueName } from "@/modules/kits/naming";
import type { Kit } from "@/modules/kits/service";

type ConceptOption = { id: string; code: string; description: string; unitName: string; active: boolean; categoryId: string };
type CategoryOption = { id: string; name: string; active: boolean };
type DynamicOption = { id: string; name: string; description: string; active: boolean };

const errorsOf = (s: ActionResult | null) => (s && !s.ok ? s.errors : {});
const Err = ({ msg }: { msg?: string }) => (msg ? <span className="kt-err" role="alert">{msg}</span> : null);
const conceptText = (c: ConceptOption) => `${c.code} · ${c.description}`;

/** «Se elige al presupuestar» (a category) or «Siempre el mismo» (an article, found with the Combobox). */
function RefPicker({ value, onChange, onNone, categories, concepts, error }: {
  value: FormRef | null; onChange: (r: FormRef) => void; onNone?: () => void; categories: CategoryOption[]; concepts: ConceptOption[]; error?: string;
}) {
  const pick = (kind: FormRef["kind"]) => { if (kind !== value?.kind) onChange({ kind, id: "" }); };
  // The active articles plus the one already named, even if deactivated; the category goes in the third column.
  const items = concepts.filter((c) => c.active || c.id === value?.id).map((c) => ({
    id: c.id, code: c.code, description: c.description,
    extra: `${categories.find((k) => k.id === c.categoryId)?.name ?? ""}${c.active ? "" : " (desactivado)"}`,
  }));
  return (
    <>
      <div className="kt-seg" role="group" aria-label="Cómo se elige">
        <button type="button" aria-pressed={value?.kind === "categoryId"} onClick={() => pick("categoryId")}>Se elige al presupuestar</button>
        <button type="button" aria-pressed={value?.kind === "conceptId"} onClick={() => pick("conceptId")}>Siempre el mismo</button>
        {onNone && <button type="button" aria-pressed={!value} onClick={onNone}>Sin principal</button>}
      </div>
      {!value ? null : value.kind === "categoryId" ? (
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

export function KitForm({ kit, kind, concepts, categories, dynamicKits, taken }: {
  kit: Kit | null; kind: "normal" | "dynamic"; concepts: ConceptOption[]; categories: CategoryOption[]; dynamicKits: DynamicOption[]; taken: string[];
}) {
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
  const dynamic = kind === "dynamic";
  // Same rule as autoKitName: without a main, the first three slot types' abbreviations.
  // A dynamic «in the name» adds the first two letters of its first template's name, as in autoKitName.
  const kitName = (id: string) => dynamicKits.find((k) => k.id === id)?.name ?? "";
  const dynPrefix = (d: FormDynamic) => codePrefix(kitName(d.templateIds[0] ?? "")).slice(0, 2);
  const baseOf = (main: FormRef | null, materials: FormMaterial[], types: FormSlotType[], dyns: FormDynamic[]) => kitBaseName(
    main ? info(main).prefix : types.slice(0, 3).map((t) => t.abbr.trim().toUpperCase()).join("-"),
    [...materials.filter((m) => m.inName).map((m) => info(m.ref).prefix), ...dyns.filter((d) => d.inName).map(dynPrefix)],
  );

  const [initial] = useState(() => {
    const blank: FormRef = { kind: "categoryId", id: "" };
    const d = kit ? fromDefinition(kit.definition) : { main: blank, materials: [] };
    const extras = kit ? extrasFromDefinition(kit.definition) : { kind, slotTypes: [], dynamics: [] };
    return { ...d, ...extras, main: d.main ?? (kit ? null : blank) };
  });
  const [main, setMain] = useState<FormRef | null>(initial.main);
  const [materials, setMaterials] = useState<FormMaterial[]>(initial.materials);
  const [slotTypes, setSlotTypes] = useState<FormSlotType[]>(initial.slotTypes);
  const [dynamics, setDynamics] = useState<FormDynamic[]>(initial.dynamics);
  const [sel, setSel] = useState<{ k: "m" | "t" | "d"; i: number }>({ k: "m", i: 0 });
  const [pickKey, setPickKey] = useState(0); // remounts the variant search box empty after each pick
  const [description] = useState(() => (kit ? legacyDescription(kit.name, baseOf(initial.main, initial.materials, initial.slotTypes, initial.dynamics), kit.description, isLegacyDefinition(kit.definition)) : ""));

  useEffect(() => {
    if (state?.ok && state.id && state.id !== kit?.id) router.replace(`/conjuntos/${state.id}`);
  }, [state, kit?.id, router]);

  const base = baseOf(main, materials, slotTypes, dynamics);
  const name = uniqueName(base, taken);
  const clash = taken.includes(base);
  const nextUnmarked = materials.findIndex((m) => !m.inName && info(m.ref).prefix);
  const cur = sel.k === "m" ? materials[sel.i] : undefined;
  const curT = sel.k === "t" ? slotTypes[sel.i] : undefined;
  const curD = sel.k === "d" ? dynamics[sel.i] : undefined;
  const setD = (i: number, p: Partial<FormDynamic>) => setDynamics(dynamics.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const addD = () => {
    setDynamics([...dynamics, { slot: nextKey("d", dynamics.map((d) => d.slot)), label: "", mode: "fixed", templateIds: [], optional: false, inName: false }]);
    setSel({ k: "d", i: dynamics.length });
  };
  const removeD = (i: number) => { setDynamics(dynamics.filter((_, j) => j !== i)); setSel({ k: "m", i: 0 }); };
  // The active dynamics plus the ones already chosen, even if deactivated.
  const dynItems = (d: FormDynamic, skip: string[]) => dynamicKits.filter((k) => (k.active || d.templateIds.includes(k.id)) && !skip.includes(k.id))
    .map((k) => ({ id: k.id, code: k.name, description: k.description, extra: k.active ? "" : "(desactivado)" }));
  // The first template picked names the part if it has no name yet.
  const pickD = (i: number, d: FormDynamic, templateIds: string[]) => {
    const k = dynamicKits.find((x) => x.id === templateIds[0]);
    setD(i, { templateIds, label: d.label || (k?.description || k?.name || "").slice(0, 300) });
  };
  const set = (i: number, p: Partial<FormMaterial>) => setMaterials(materials.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const add = () => {
    setMaterials([...materials, { slot: nextKey("c", materials.map((m) => m.slot)), ref: { kind: "categoryId", id: "" }, qty: "1", mult: true, ask: false, required: true, inName: materials.length === 0 }]);
    setSel({ k: "m", i: materials.length });
  };
  const remove = (i: number) => { setMaterials(materials.filter((_, j) => j !== i)); setSel({ k: "m", i: Math.max(0, Math.min(i, materials.length - 2)) }); };
  const setT = (i: number, p: Partial<FormSlotType>) => setSlotTypes(slotTypes.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const addT = () => {
    setSlotTypes([...slotTypes, { key: nextKey("t", slotTypes.map((t) => t.key)), label: "", abbr: "", red: false, mode: "conceptIds", conceptIds: [], categoryId: "" }]);
    setSel({ k: "t", i: slotTypes.length });
  };
  const removeT = (i: number) => { setSlotTypes(slotTypes.filter((_, j) => j !== i)); setSel({ k: "m", i: 0 }); };
  const variantsText = (t: FormSlotType) => {
    if (t.mode === "categoryId") {
      const c = categories.find((x) => x.id === t.categoryId);
      return c ? `Toda la categoría «${c.name}» (${concepts.filter((x) => x.active && x.categoryId === c.id).length})` : "categoría sin elegir";
    }
    return t.conceptIds.map((id) => concepts.find((c) => c.id === id)?.description ?? id).join(" · ") || "sin variantes";
  };
  const variantItems = (t: FormSlotType) => concepts.filter((c) => c.active && !t.conceptIds.includes(c.id))
    .map((c) => ({ id: c.id, code: c.code, description: c.description, extra: categories.find((k) => k.id === c.categoryId)?.name ?? "" }));

  return (
    <form
      onSubmit={(ev) => { ev.preventDefault(); const data = new FormData(ev.currentTarget); startTransition(() => action(data)); }}
      style={{ marginTop: 4 }}
    >
      {kit && <input type="hidden" name="id" value={kit.id} />}
      <input type="hidden" name="definition" value={JSON.stringify(toDefinition(main, materials, info, { kind, slotTypes, dynamics }))} />

      <div className="kt-id">
        <h1 className="kt-name"><u>{name.slice(0, 2)}</u>{name.slice(2)}</h1>
        <span className="mini" aria-hidden><i>{name.slice(0, 2)}</i>{materials.map((m) => <s key={m.slot} />)}{dynamics.map((d) => <s key={d.slot} className="sq" />)}{dynamic && <s className="dy" />}</span>
      </div>
      <p className="kt-note">
        Nombre automático: prefijo del principal{dynamic && " (sin principal, las abreviaturas de los slots)"} + lo marcado «en el nombre». Las 2 letras subrayadas van en el símbolo.
        {dynamics.length > 0 && " Cada ■ del símbolo es un conjunto dinámico."}
        {dynamic && " El □ del símbolo indica que lleva slots."}
      </p>
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
                <RefPicker key={`main-${main?.kind}`} value={main} onChange={setMain} onNone={dynamic ? () => setMain(null) : undefined}
                  categories={categories} concepts={concepts} error={errAt("definition.main")} />
              </div>
              {main && <div className="kt-fl">Cantidad<div className="kt-fixed">Se pide al presupuestar</div></div>}
            </div>
          </div>
          <div className="kt-bus">
            {materials.map((m, i) => {
              const it = info(m.ref);
              const bad = !!errAt(`definition.components.${i}.`);
              return (
                <div className="kt-row" key={m.slot}>
                  <button type="button" className={`kt-dep${bad ? " bad" : ""}`} aria-pressed={sel.k === "m" && i === sel.i} onClick={() => setSel({ k: "m", i })}>
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
                    <span className="kt-chev" aria-hidden>{sel.k === "m" && i === sel.i ? "⌄" : "›"}</span>
                  </button>
                </div>
              );
            })}
            {dynamics.map((d, i) => (
              <div className="kt-row" key={d.slot}>
                <button type="button" className={`kt-dep${errAt(`definition.dynamics.${i}.`) ? " bad" : ""}`} aria-pressed={sel.k === "d" && i === sel.i} onClick={() => setSel({ k: "d", i })}>
                  <span>
                    {dynPrefix(d) && <span className={`kt-pf${d.inName ? "" : " off"}`}>{dynPrefix(d)}</span>}
                    <b className={d.label ? undefined : "mut"}>{d.label || "Sin nombre"}</b>
                    <small>
                      conjunto dinámico {d.templateIds.map(kitName).join(" / ") || "sin elegir"}
                      {d.mode === "choose" ? " · se elige en el borrador" : ""} · {d.optional ? "opcional" : "obligatorio"}
                    </small>
                  </span>
                  <span className="kt-sum">{d.optional ? "opcional" : "obligatorio"}</span>
                  <span className="kt-chev" aria-hidden>{sel.k === "d" && i === sel.i ? "⌄" : "›"}</span>
                </button>
              </div>
            ))}
            <div className="kt-row">
              {dynamic ? <button type="button" className="kt-add" onClick={add}>+ Añadir material fijo</button> : (
                <div className="kt-add2">
                  <button type="button" onClick={add}>+ Añadir material</button>
                  {dynamics.length < 5 && <button type="button" className="g" onClick={addD}>+ Añadir conjunto dinámico</button>}
                </div>
              )}
            </div>
            <Err msg={e["definition.dynamics"]} />
          </div>
          {dynamic && (
            <div className="slotdef">
              <header><h2>Slots · tipos que se pueden añadir</h2><span className="kt-hint">En el borrador se añaden los slots que hagan falta, de estos tipos.</span></header>
              <Err msg={e["definition.slotTypes"]} />
              {slotTypes.map((t, i) => (
                <button type="button" key={t.key} className={`st${errAt(`definition.slotTypes.${i}.`) ? " bad" : ""}`} aria-pressed={sel.k === "t" && sel.i === i} onClick={() => setSel({ k: "t", i })}>
                  <span className={t.red ? "tt red" : "tt"}>{t.abbr.trim().toUpperCase() || "?"}</span>
                  <b className={t.label ? undefined : "mut"}>{t.label || "Sin nombre"}</b>
                  <span className="vs">{variantsText(t)}</span>
                  <span className="kt-chev" aria-hidden>{sel.k === "t" && sel.i === i ? "⌄" : "›"}</span>
                </button>
              ))}
              <button type="button" className="st-add" onClick={addT}>+ Añadir tipo de slot</button>
            </div>
          )}
        </div>

        <div className="kt-panel">
          {curD ? (
            <>
              <h3>Conjunto dinámico: {curD.label || "sin nombre"}</h3>
              <div className="kt-erow"><span>Cuál</span>
                <div className="kt-seg" role="group" aria-label="Cuál">
                  <button type="button" aria-pressed={curD.mode === "choose"} onClick={() => setD(sel.i, { mode: "choose" })}>Se elige al presupuestar</button>
                  <button type="button" aria-pressed={curD.mode === "fixed"} onClick={() => setD(sel.i, { mode: "fixed", templateIds: curD.templateIds.slice(0, 1) })}>Siempre el mismo</button>
                </div>
              </div>
              {curD.mode === "fixed" ? (
                <label className="kt-fl">Conjunto dinámico
                  <Combobox key={curD.slot} items={dynItems(curD, [])} value={curD.templateIds[0] ?? ""} invalid={!!errAt(`definition.dynamics.${sel.i}.choice`)}
                    label="Conjunto dinámico" placeholder="Escribe el nombre o la descripción" onPick={(id) => pickD(sel.i, curD, [id])} />
                </label>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {curD.templateIds.length > 0 && (
                    <ul className="vlist">
                      {curD.templateIds.map((id) => (
                        <li key={id}><b>{kitName(id)}</b><span>{dynamicKits.find((k) => k.id === id)?.description}</span>
                          <button type="button" aria-label={`Quitar ${kitName(id)}`} onClick={() => setD(sel.i, { templateIds: curD.templateIds.filter((x) => x !== id) })}>✕</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Combobox key={`${curD.slot}-${pickKey}`} items={dynItems(curD, curD.templateIds)} value="" autoFocus={pickKey > 0} label="Añadir conjunto dinámico"
                    invalid={!!errAt(`definition.dynamics.${sel.i}.choice`)} placeholder="Añadir: nombre o descripción"
                    onPick={(id) => { pickD(sel.i, curD, [...curD.templateIds, id]); setPickKey(pickKey + 1); }} />
                  <p className="kt-hint">En el borrador se elige uno de estos (al menos dos).</p>
                </div>
              )}
              <Err msg={errAt(`definition.dynamics.${sel.i}.choice`)} />
              <label className="kt-erow"><span>Nombre</span>
                <input className="kt-in" value={curD.label} maxLength={300} aria-invalid={!!errAt(`definition.dynamics.${sel.i}.label`)} onChange={(ev) => setD(sel.i, { label: ev.target.value })} />
              </label>
              <Err msg={errAt(`definition.dynamics.${sel.i}.label`)} />
              <label className="kt-erow"><span>Opcional</span>
                <span><input type="checkbox" className="kt-ck" checked={curD.optional} onChange={(ev) => setD(sel.i, { optional: ev.target.checked })} /></span>
              </label>
              {curD.optional && <p className="kt-hint">En el borrador sale «+ Añadir {curD.label || "conjunto dinámico"}»; sin él el conjunto está completo.</p>}
              <label className="kt-erow"><span>En el nombre{dynPrefix(curD) ? ` (${dynPrefix(curD)})` : ""}</span>
                <span><input type="checkbox" className="kt-ck" checked={curD.inName} onChange={(ev) => setD(sel.i, { inName: ev.target.checked })} /></span>
              </label>
              <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={() => removeD(sel.i)}>Quitar</button>
            </>
          ) : curT ? (
            <>
              <h3>Tipo de slot: {curT.label || "sin nombre"}</h3>
              <label className="kt-erow"><span>Nombre</span>
                <input className="kt-in" value={curT.label} maxLength={300} aria-invalid={!!errAt(`definition.slotTypes.${sel.i}.label`)} onChange={(ev) => setT(sel.i, { label: ev.target.value })} />
              </label>
              <Err msg={errAt(`definition.slotTypes.${sel.i}.label`)} />
              <label className="kt-erow"><span>Abreviatura</span>
                <input className="kt-in" style={{ width: "5rem" }} maxLength={4} value={curT.abbr} aria-invalid={!!errAt(`definition.slotTypes.${sel.i}.abbr`)} onChange={(ev) => setT(sel.i, { abbr: ev.target.value.toUpperCase() })} />
              </label>
              <Err msg={errAt(`definition.slotTypes.${sel.i}.abbr`)} />
              <div className="kt-erow"><span>Color</span>
                <div className="kt-seg" role="group" aria-label="Color">
                  <button type="button" aria-pressed={!curT.red} onClick={() => setT(sel.i, { red: false })}>Normal</button>
                  <button type="button" aria-pressed={curT.red} onClick={() => setT(sel.i, { red: true })}>Rojo</button>
                </div>
              </div>
              <p className="kt-hint">Rojo resalta el tipo (p. ej. safety) en el borrador y en las listas. No sale en el PDF.</p>
              <div className="kt-erow"><span>Variantes</span>
                <div className="kt-seg" role="group" aria-label="Variantes">
                  <button type="button" aria-pressed={curT.mode === "categoryId"} onClick={() => setT(sel.i, { mode: "categoryId" })}>Toda una categoría</button>
                  <button type="button" aria-pressed={curT.mode === "conceptIds"} onClick={() => setT(sel.i, { mode: "conceptIds" })}>Elegidas</button>
                </div>
              </div>
              {curT.mode === "categoryId" ? (
                <label className="kt-fl">Categoría
                  <select className="kt-in" value={curT.categoryId} aria-invalid={!!errAt(`definition.slotTypes.${sel.i}.variants`)} onChange={(ev) => setT(sel.i, { categoryId: ev.target.value })}>
                    <option value="" disabled>Elige…</option>
                    {categories.filter((c) => c.active || c.id === curT.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (desactivada)"}</option>)}
                  </select>
                </label>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {curT.conceptIds.length > 0 && (
                    <ul className="vlist">
                      {curT.conceptIds.map((id) => {
                        const c = concepts.find((x) => x.id === id);
                        return (
                          <li key={id}><b>{c?.code}</b><span>{c?.description ?? id}{c && !c.active ? " (desactivado)" : ""}</span>
                            <button type="button" aria-label={`Quitar ${c?.description ?? id}`} onClick={() => setT(sel.i, { conceptIds: curT.conceptIds.filter((x) => x !== id) })}>✕</button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Combobox key={`${curT.key}-${pickKey}`} items={variantItems(curT)} value="" autoFocus={pickKey > 0} label="Añadir variante"
                    placeholder="Añadir variante: código, descripción o categoría"
                    onPick={(id) => { setT(sel.i, { conceptIds: [...curT.conceptIds, id] }); setPickKey(pickKey + 1); }} />
                </div>
              )}
              <Err msg={errAt(`definition.slotTypes.${sel.i}.variants`)} />
              <p className="kt-hint">
                {curT.mode === "categoryId" ? "Un artículo nuevo de la categoría aparece solo como variante." : "Escribe código, descripción o categoría; Tab o Intro añade la resaltada."}
              </p>
              <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={() => removeT(sel.i)}>Quitar tipo</button>
            </>
          ) : !cur ? <p className="mut">{dynamic ? "Elige un material o un tipo de slot para editarlo." : "Añade un material para editarlo."}</p> : (
            <>
              <h3>Material: {info(cur.ref).label}</h3>
              <div style={{ display: "grid", gap: 10 }}>
                <RefPicker key={`${cur.slot}-${cur.ref.kind}`} value={cur.ref} onChange={(ref) => set(sel.i, { ref })} categories={categories} concepts={concepts} error={errAt(`definition.components.${sel.i}.ref`)} />
              </div>
              <label className="kt-erow"><span>Cantidad</span>
                <span className="kt-qty">
                  <input className="kt-in num" inputMode="decimal" value={cur.ask ? "" : cur.qty} disabled={cur.ask} placeholder={cur.ask ? "—" : undefined}
                    aria-invalid={!!errAt(`definition.components.${sel.i}.formula`)} onChange={(ev) => set(sel.i, { qty: ev.target.value })} />
                  <span className="kt-unit">{info(cur.ref).unit}</span>
                </span>
              </label>
              <Err msg={errAt(`definition.components.${sel.i}.formula`)} />
              <label className="kt-erow"><span>Se pone al presupuestar</span>
                <span><input type="checkbox" className="kt-ck" checked={cur.ask} onChange={(ev) => set(sel.i, { ask: ev.target.checked })} /></span>
              </label>
              <label className="kt-erow"><span>× cantidad del principal</span>
                <span><input type="checkbox" role="switch" className="kt-sw" checked={cur.mult} onChange={(ev) => set(sel.i, { mult: ev.target.checked })} /></span>
              </label>
              <p className="kt-hint">{cur.mult ? "Si el principal lleva 2, esto se multiplica por 2." : "Va una sola vez, lleve el principal lo que lleve."}</p>
              {showsRequired(cur) && (
                <label className="kt-erow"><span>Obligatorio</span>
                  <span><input type="checkbox" className="kt-ck" checked={cur.required} onChange={(ev) => set(sel.i, { required: ev.target.checked })} /></span>
                </label>
              )}
              <label className="kt-erow"><span>En el nombre{info(cur.ref).prefix ? ` (${info(cur.ref).prefix})` : ""}</span>
                <span><input type="checkbox" className="kt-ck" checked={cur.inName} onChange={(ev) => set(sel.i, { inName: ev.target.checked })} /></span>
              </label>
              <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={() => remove(sel.i)}>Quitar material</button>
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
