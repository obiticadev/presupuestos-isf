"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { saveLogoAction, saveTaxAction, setTaxActiveAction, updateSettingsAction } from "@/modules/settings/actions";

type Field = { name: string; label: string; value: string; kind?: "text" | "textarea" | "email" | "decimal" | "days" };

const errorsOf = (s: ActionResult | null) => (s && !s.ok ? s.errors : {});
const small = { minHeight: 34, padding: "4px 10px" } as const;
const input = { font: "inherit", border: "1.5px solid var(--ink)", padding: "4px 8px", minHeight: 34, background: "var(--sheet)" } as const;

function Msg({ state, field }: { state: ActionResult | null; field?: string }) {
  const msg = field ? errorsOf(state)[field] : errorsOf(state)._;
  if (msg) return <span className="msg" role="alert">{msg}</span>;
  return !field && state?.ok ? <span className="mut" role="status">Guardado</span> : null;
}

/** One settings section: saves only its own fields. */
export function SettingsSection({ title, fields }: { title: string; fields: Field[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateSettingsAction, null);
  return (
    <section>
      <h2>{title}</h2>
      <form action={action} className="sheet" style={{ display: "grid", gap: 14 }}>
        {fields.map((f) => (
          <label key={f.name} className="field">
            {f.label}
            {f.kind === "textarea" ? (
              <textarea name={f.name} defaultValue={f.value} rows={4} style={{ ...input, padding: "8px 10px", resize: "vertical" }} />
            ) : (
              <input
                name={f.name}
                defaultValue={f.value}
                type={f.kind === "email" ? "email" : "text"}
                inputMode={f.kind === "decimal" ? "decimal" : f.kind === "days" ? "numeric" : undefined}
              />
            )}
            <Msg state={state} field={f.name} />
          </label>
        ))}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn pri" disabled={pending}>Guardar</button>
          <Msg state={state} />
        </div>
      </form>
    </section>
  );
}

export function LogoForm({ hasLogo }: { hasLogo: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveLogoAction, null);
  return (
    <section>
      <h2>Logo</h2>
      <form action={action} className="sheet" style={{ display: "flex", gap: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from DATA_DIR behind the session, not a static asset
          <img src={`/api/logo?v=${state?.ok ? "new" : "cur"}`} alt="Logo actual" style={{ maxHeight: 80, maxWidth: 220, border: "1px solid var(--rule)" }} />
        ) : (
          <span className="mut">Sin logo</span>
        )}
        <label className="field">
          PNG o JPEG, hasta 2 MB
          <input type="file" name="logo" accept="image/png,image/jpeg" required />
          <Msg state={state} field="logo" />
        </label>
        <button className="btn pri" disabled={pending}>Subir logo</button>
        <Msg state={state} />
      </form>
    </section>
  );
}

export type TaxRow = { id: string; name: string; rate: string; isDefault: boolean; active: boolean };

function TaxForm({ tax }: { tax?: TaxRow }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveTaxAction, null);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {tax && <input type="hidden" name="id" value={tax.id} />}
      <input name="name" defaultValue={tax?.name} aria-label="Nombre" placeholder="Nombre" required style={{ ...input, width: 160 }} />
      <input name="ratePct" defaultValue={tax?.rate} aria-label="Tipo (%)" placeholder="21" inputMode="decimal" required style={{ ...input, width: 80, textAlign: "right" }} />
      <span className="mut">%</span>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" name="isDefault" defaultChecked={tax?.isDefault} /> Por defecto
      </label>
      <button className={tax ? "btn" : "btn pri"} disabled={pending} style={small}>{tax ? "Guardar" : "Añadir"}</button>
      <Msg state={state} field="name" />
      <Msg state={state} field="ratePct" />
      <Msg state={state} field="isDefault" />
      <Msg state={state} />
    </form>
  );
}

function TaxActiveForm({ tax }: { tax: TaxRow }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setTaxActiveAction, null);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="id" value={tax.id} />
      <input type="hidden" name="active" value={tax.active ? "0" : "1"} />
      <button className={tax.active ? "btn warn" : "btn"} disabled={pending || (tax.active && tax.isDefault)} style={small}>
        {tax.active ? "Desactivar" : "Activar"}
      </button>
      <Msg state={state} />
    </form>
  );
}

export function TaxesTable({ taxes }: { taxes: TaxRow[] }) {
  return (
    <section>
      <h2>Impuestos</h2>
      <table>
        <thead><tr><th>Impuesto</th><th>Estado</th></tr></thead>
        <tbody>
          {taxes.map((t) => (
            <tr key={t.id} style={t.active ? undefined : { opacity: 0.6 }}>
              <td><TaxForm tax={t} /></td>
              <td>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {!t.active && <span className="badge off">Desactivado</span>}
                  <TaxActiveForm tax={t} />
                </div>
              </td>
            </tr>
          ))}
          <tr><td colSpan={2}><TaxForm /></td></tr>
        </tbody>
      </table>
    </section>
  );
}
