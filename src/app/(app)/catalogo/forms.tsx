"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/action-result";
import { suggestSalePrice } from "@/lib/decimal";
import {
  removeConceptAction, saveConceptAction, setConceptActiveAction,
  type RemoveResult, type SaveConceptResult,
} from "@/modules/catalog/actions";

export type ConceptValues = {
  id: string; code: string; description: string; categoryId: string; unitId: string; taxId: string;
  salePrice: string; cost: string; listPrice: string; discountPct: string;
  validated: boolean; active: boolean; notes: string; manufacturer: string; supplierRef: string; supplier: string;
};
type Option = { id: string; name: string; active: boolean };

const errorsOf = (s: ActionResult | null) => (s && !s.ok ? s.errors : {});
const Err = ({ msg }: { msg?: string }) => (msg ? <span className="msg" role="alert">{msg}</span> : null);

/** Active options plus the concept's current one, even if it was deactivated later. */
function Choice({ name, label, options, value, error }: { name: string; label: string; options: Option[]; value?: string; error?: string }) {
  const shown = options.filter((o) => o.active || o.id === value);
  return (
    <label className="field">
      {label}
      <select name={name} defaultValue={value ?? ""} required>
        {!value && <option value="" disabled>Elige…</option>}
        {shown.map((o) => <option key={o.id} value={o.id}>{o.name}{o.active ? "" : " (desactivado)"}</option>)}
      </select>
      <Err msg={error} />
    </label>
  );
}

export function ConceptForm({ concept, categories, units, taxes, marginPct, listHref }: {
  concept: ConceptValues | null; categories: Option[]; units: Option[]; taxes: Option[]; marginPct: string; listHref: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<SaveConceptResult | null, FormData>(saveConceptAction, null);
  const e = errorsOf(state);
  const defaultTax = taxes.find((t) => t.active)?.id;

  // A new concept opens its own panel once saved.
  useEffect(() => {
    if (state?.ok && state.id && state.id !== concept?.id) router.replace(`${listHref}&concepto=${state.id}#panel`);
  }, [state, concept?.id, listHref, router]);

  function propose() {
    const f = form.current;
    if (!f) return;
    const cost = (f.elements.namedItem("cost") as HTMLInputElement).value;
    const suggestion = suggestSalePrice(cost, marginPct.replace(",", "."));
    if (suggestion) (f.elements.namedItem("salePrice") as HTMLInputElement).value = suggestion;
  }

  return (
    <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
      <form
        ref={form}
        // onSubmit instead of `action` so React keeps what was typed when the server rejects it.
        onSubmit={(ev) => { ev.preventDefault(); const data = new FormData(ev.currentTarget); startTransition(() => action(data)); }}
        style={{ display: "grid", gap: 12 }}
      >
        {concept && <input type="hidden" name="id" value={concept.id} />}
        <label className="field">Código<input name="code" defaultValue={concept?.code} required maxLength={30} /><Err msg={e.code} /></label>
        <label className="field">Descripción<input name="description" defaultValue={concept?.description} required maxLength={300} /><Err msg={e.description} /></label>
        <div className="pair">
          <Choice name="categoryId" label="Categoría" options={categories} value={concept?.categoryId} error={e.categoryId} />
          <Choice name="unitId" label="Unidad" options={units} value={concept?.unitId} error={e.unitId} />
          <label className="field">Coste<input name="cost" defaultValue={concept?.cost} placeholder="Opcional" inputMode="decimal" /><Err msg={e.cost} /></label>
          <label className="field">Precio de venta<input name="salePrice" defaultValue={concept?.salePrice} inputMode="decimal" /><Err msg={e.salePrice} /></label>
        </div>
        <button type="button" className="btn" onClick={propose} style={{ justifySelf: "start" }}>
          Proponer precio (margen {marginPct} %)
        </button>
        <Choice name="taxId" label="Impuesto" options={taxes} value={concept?.taxId ?? defaultTax} error={e.taxId} />
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}>
          <input type="checkbox" name="validated" defaultChecked={concept?.validated} style={{ width: 20, height: 20, accentColor: "#004742" }} />
          Precio validado
        </label>
        {!concept?.validated && (
          <p className="warnbox">Mientras no esté validado, se puede usar en borradores, pero bloquea la emisión.</p>
        )}
        {concept && !concept.salePrice && (
          <p className="warnbox">Sin precio de venta: no se podrá usar en presupuestos.</p>
        )}
        <label className="field">Observaciones<textarea name="notes" defaultValue={concept?.notes} rows={3} /><Err msg={e.notes} /></label>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Datos de proveedor</summary>
          <div className="pair" style={{ marginTop: 10 }}>
            <label className="field">Fabricante<input name="manufacturer" defaultValue={concept?.manufacturer} /></label>
            <label className="field">Proveedor<input name="supplier" defaultValue={concept?.supplier} /></label>
            <label className="field">Referencia<input name="supplierRef" defaultValue={concept?.supplierRef} /></label>
            <label className="field">PVP<input name="listPrice" defaultValue={concept?.listPrice} inputMode="decimal" /><Err msg={e.listPrice} /></label>
            <label className="field">Descuento (%)<input name="discountPct" defaultValue={concept?.discountPct} inputMode="decimal" /><Err msg={e.discountPct} /></label>
          </div>
        </details>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn pri" disabled={pending}>Guardar</button>
          {state?.ok && <span className="mut" role="status">Guardado</span>}
          <Err msg={e._} />
        </div>
      </form>
      {concept && <ConceptDangerZone concept={concept} />}
    </div>
  );
}

// After a delete the page re-renders without the concept and says so; this panel just disappears.
function ConceptDangerZone({ concept }: { concept: ConceptValues }) {
  const [removed, remove, removing] = useActionState<RemoveResult | null, FormData>(removeConceptAction, null);
  const [toggled, toggle, toggling] = useActionState<ActionResult | null, FormData>(setConceptActiveAction, null);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
      <form action={toggle}>
        <input type="hidden" name="id" value={concept.id} />
        <input type="hidden" name="active" value={concept.active ? "0" : "1"} />
        <button className={concept.active ? "btn warn" : "btn"} disabled={toggling}>{concept.active ? "Desactivar" : "Reactivar"}</button>
      </form>
      <form action={remove}>
        <input type="hidden" name="id" value={concept.id} />
        <button className="btn" disabled={removing}>Eliminar</button>
      </form>
      {removed?.ok && removed.outcome === "deactivated" && <span className="mut" role="status">Concepto desactivado porque está en uso</span>}
      <Err msg={errorsOf(removed)._ ?? errorsOf(toggled)._} />
      <p className="mut" style={{ fontSize: 12, width: "100%" }}>
        «Eliminar» lo borra si ningún presupuesto lo usa; si alguno lo usa, lo desactiva.
      </p>
    </div>
  );
}
