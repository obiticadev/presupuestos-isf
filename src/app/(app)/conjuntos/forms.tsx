"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { saveKitAction, setKitActiveAction, type SaveKitResult } from "@/modules/kits/actions";
import { describeFormula, type KitDefinition } from "@/modules/kits/definition";
import type { Kit } from "@/modules/kits/service";

type Option = { id: string; name: string; active: boolean };
type RefKind = "conceptId" | "categoryId";
// Form state: refs as {kind, id} and k as typed text; turned into a KitDefinition on submit.
type FormRef = { kind: RefKind; id: string };
type FormParam = { key: string; label: string; unit: string; required: boolean };
type FormComponent = { slot: string; label: string; ref: FormRef; required: boolean; type: "FIXED" | "PER_QTY" | "PER_QTY_AND_PARAM"; k: string; param: string };

const errorsOf = (s: ActionResult | null) => (s && !s.ok ? s.errors : {});
const Err = ({ msg }: { msg?: string }) => (msg ? <span className="msg" role="alert">{msg}</span> : null);
const toRef = (r: { conceptId: string } | { categoryId: string }): FormRef =>
  "conceptId" in r ? { kind: "conceptId", id: r.conceptId } : { kind: "categoryId", id: r.categoryId };
const fromRef = (r: FormRef) => (r.kind === "conceptId" ? { conceptId: r.id } : { categoryId: r.id });
const comma = (k: string) => k.replace(".", ",");
const nextId = (prefix: string, used: string[]) => {
  let n = 1;
  while (used.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

function RefPicker({ value, onChange, concepts, categories, error }: {
  value: FormRef; onChange: (r: FormRef) => void; concepts: Option[]; categories: Option[]; error?: string;
}) {
  const options = (value.kind === "conceptId" ? concepts : categories).filter((o) => o.active || o.id === value.id);
  return (
    <div className="pair">
      <label className="field">Qué se usa
        <select value={value.kind} onChange={(e) => onChange({ kind: e.target.value as RefKind, id: "" })}>
          <option value="categoryId">Elegir de una categoría al presupuestar</option>
          <option value="conceptId">Un concepto fijo</option>
        </select>
      </label>
      <label className="field">{value.kind === "conceptId" ? "Concepto" : "Categoría"}
        <select value={value.id} onChange={(e) => onChange({ ...value, id: e.target.value })} required>
          <option value="" disabled>Elige…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.active ? "" : " (desactivado)"}</option>)}
        </select>
        <Err msg={error} />
      </label>
    </div>
  );
}

export function KitForm({ kit, concepts, categories }: { kit: Kit | null; concepts: Option[]; categories: Option[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SaveKitResult | null, FormData>(saveKitAction, null);
  const e = errorsOf(state);
  const def = kit?.definition;
  const [mainLabel, setMainLabel] = useState(def?.main.label ?? "");
  const [mainRef, setMainRef] = useState<FormRef>(def ? toRef(def.main) : { kind: "categoryId", id: "" });
  const [params, setParams] = useState<FormParam[]>(def?.params ?? []);
  const [components, setComponents] = useState<FormComponent[]>(
    def?.components.map((c) => ({
      slot: c.slot, label: c.label, ref: toRef(c.ref), required: c.required, type: c.formula.type,
      k: comma(c.formula.k), param: c.formula.type === "PER_QTY_AND_PARAM" ? c.formula.param : "",
    })) ?? [],
  );

  useEffect(() => {
    if (state?.ok && state.id && state.id !== kit?.id) router.replace(`/conjuntos/${state.id}`);
  }, [state, kit?.id, router]);

  const definition = {
    main: { ...fromRef(mainRef), label: mainLabel },
    params,
    components: components.map((c) => ({
      slot: c.slot, label: c.label, ref: fromRef(c.ref), required: c.required,
      formula: c.type === "PER_QTY_AND_PARAM" ? { type: c.type, param: c.param, k: c.k } : { type: c.type, k: c.k },
    })),
  };
  const setParam = (i: number, p: Partial<FormParam>) => setParams(params.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const setComp = (i: number, p: Partial<FormComponent>) => setComponents(components.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const words = (c: FormComponent) =>
    c.k ? describeFormula(
      (c.type === "PER_QTY_AND_PARAM" ? { type: c.type, param: c.param, k: c.k } : { type: c.type, k: c.k }) as KitDefinition["components"][number]["formula"],
      params,
    ) : "…";

  return (
    <form
      onSubmit={(ev) => { ev.preventDefault(); const data = new FormData(ev.currentTarget); startTransition(() => action(data)); }}
      style={{ display: "grid", gap: 16, marginTop: 18, maxWidth: 820 }}
    >
      {kit && <input type="hidden" name="id" value={kit.id} />}
      <input type="hidden" name="definition" value={JSON.stringify(definition)} />
      <label className="field">Nombre<input name="name" defaultValue={kit?.name} required maxLength={100} /><Err msg={e.name} /></label>
      <label className="field">Descripción<textarea name="description" defaultValue={kit?.description} rows={2} /><Err msg={e.description} /></label>

      <fieldset className="sheet" style={{ display: "grid", gap: 10 }}>
        <legend style={{ fontWeight: 700 }}>Principal: su cantidad es N</legend>
        <label className="field">Nombre en el presupuesto<input value={mainLabel} onChange={(ev) => setMainLabel(ev.target.value)} placeholder="Bomba" required /><Err msg={e["definition.main.label"]} /></label>
        <RefPicker value={mainRef} onChange={setMainRef} concepts={concepts} categories={categories} error={e["definition.main"]} />
      </fieldset>

      <fieldset className="sheet" style={{ display: "grid", gap: 10 }}>
        <legend style={{ fontWeight: 700 }}>Datos que se piden al presupuestar</legend>
        {params.map((p, i) => (
          <div key={p.key} className="flexrow">
            <label className="field grow">Dato<input value={p.label} onChange={(ev) => setParam(i, { label: ev.target.value })} placeholder="Distancia al cuadro" required /><Err msg={e[`definition.params.${i}.label`]} /></label>
            <label className="field">Unidad<input value={p.unit} onChange={(ev) => setParam(i, { unit: ev.target.value })} placeholder="m" size={6} /></label>
            <label className="check"><input type="checkbox" checked={p.required} onChange={(ev) => setParam(i, { required: ev.target.checked })} />Obligatorio</label>
            <button type="button" className="btn" onClick={() => setParams(params.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
        <button type="button" className="btn" style={{ justifySelf: "start" }}
          onClick={() => setParams([...params, { key: nextId("d", params.map((p) => p.key)), label: "", unit: "", required: true }])}>
          Añadir dato
        </button>
      </fieldset>

      <fieldset className="sheet" style={{ display: "grid", gap: 14 }}>
        <legend style={{ fontWeight: 700 }}>Componentes</legend>
        {components.map((c, i) => {
          const at = (f: string) => e[`definition.components.${i}.${f}`];
          return (
            <div key={c.slot} style={{ display: "grid", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--rule)" }}>
              <div className="flexrow">
                <label className="field grow">Nombre<input value={c.label} onChange={(ev) => setComp(i, { label: ev.target.value })} placeholder="Manguera" required /><Err msg={at("label")} /></label>
                <label className="check"><input type="checkbox" checked={c.required} onChange={(ev) => setComp(i, { required: ev.target.checked })} />Obligatorio</label>
                <button type="button" className="btn" onClick={() => setComponents(components.filter((_, j) => j !== i))}>Quitar</button>
              </div>
              <RefPicker value={c.ref} onChange={(ref) => setComp(i, { ref })} concepts={concepts} categories={categories} error={at("ref")} />
              <div className="flexrow">
                <label className="field">Cantidad
                  <select value={c.type} onChange={(ev) => setComp(i, { type: ev.target.value as FormComponent["type"] })}>
                    <option value="FIXED">Fija: k</option>
                    <option value="PER_QTY">Por cantidad: k × N</option>
                    <option value="PER_QTY_AND_PARAM">Por cantidad y dato: k × N × dato</option>
                  </select>
                </label>
                <label className="field">k<input value={c.k} onChange={(ev) => setComp(i, { k: ev.target.value })} inputMode="decimal" size={6} required /><Err msg={at("formula.k")} /></label>
                {c.type === "PER_QTY_AND_PARAM" && (
                  <label className="field">Dato
                    <select value={c.param} onChange={(ev) => setComp(i, { param: ev.target.value })} required>
                      <option value="" disabled>Elige…</option>
                      {params.map((p) => <option key={p.key} value={p.key}>{p.label || "(sin nombre)"}</option>)}
                    </select>
                    <Err msg={at("formula.param")} />
                  </label>
                )}
              </div>
              <p className="mut" style={{ fontSize: 13 }}>{c.label || "Componente"}: {words(c)}</p>
            </div>
          );
        })}
        <button type="button" className="btn" style={{ justifySelf: "start" }}
          onClick={() => setComponents([...components, { slot: nextId("c", components.map((c) => c.slot)), label: "", ref: { kind: "categoryId", id: "" }, required: true, type: "PER_QTY", k: "1", param: "" }])}>
          Añadir componente
        </button>
      </fieldset>

      <p className="mut" style={{ fontSize: 13 }}>Cambiar el conjunto no altera los presupuestos donde ya se usó: cada uno guarda su copia.</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn pri" disabled={pending}>Guardar</button>
        {state?.ok && <span className="mut" role="status">Guardado</span>}
        {Object.keys(e).length > 0 && <span className="err" role="alert">{e._ ?? "Revisa los campos marcados"}</span>}
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
