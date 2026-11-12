"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import type { ActionResult } from "@/lib/action-result";
import {
  removeClientAction, removeContactAction, removeLocationAction, saveClientAction, saveContactAction,
  saveLocationAction, setClientActiveAction, type ClientActionResult,
} from "@/modules/clients/actions";

export type ClientValues = {
  id: string; legalName: string; taxId: string; tradeName: string; fiscalAddress: string; notes: string;
  paymentTerms: string; exclusions: string; offerValidityDays: string; active: boolean;
};
export type ContactValues = { id: string; name: string; role: string; email: string; phone: string; active: boolean };
export type LocationValues = { id: string; name: string; address: string; installation: string; country: string; active: boolean };

const errorsOf = (s: ActionResult | null) => (s && !s.ok ? s.errors : {});
const Err = ({ msg }: { msg?: string }) => (msg ? <span className="msg" role="alert">{msg}</span> : null);

/** Submits through the action without React's automatic form reset, so typed values survive a server error. */
const keep = (run: (data: FormData) => void) => (ev: FormEvent<HTMLFormElement>) => {
  ev.preventDefault();
  const data = new FormData(ev.currentTarget, (ev.nativeEvent as SubmitEvent).submitter);
  startTransition(() => run(data));
};

export function ClientForm({ client, cancelHref, defaultValidity }: { client: ClientValues | null; cancelHref: string; defaultValidity: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ClientActionResult | null, FormData>(saveClientAction, null);
  const e = errorsOf(state);

  useEffect(() => {
    if (state?.ok && state.id) router.push(`/clientes/${state.id}`);
  }, [state, router]);

  const field = (name: keyof ClientValues, label: string, opts: { area?: boolean; required?: boolean; placeholder?: string } = {}) => (
    <label className="field">
      {label}
      {opts.area ? (
        <textarea name={name} defaultValue={client ? String(client[name]) : ""} rows={3} />
      ) : (
        <input name={name} defaultValue={client ? String(client[name]) : ""} required={opts.required} placeholder={opts.placeholder} />
      )}
      <Err msg={e[name]} />
    </label>
  );

  return (
    <form onSubmit={keep(action)} className="sheet" style={{ display: "grid", gap: 14, marginTop: 18 }}>
      {client && <input type="hidden" name="id" value={client.id} />}
      <div className="pair">
        {field("legalName", "Razón social", { required: true })}
        {field("taxId", "CIF/NIF", { required: true })}
        {field("tradeName", "Nombre comercial")}
        {field("offerValidityDays", "Validez de la oferta (días)", { placeholder: `Vacío = ${defaultValidity} (por defecto)` })}
      </div>
      {field("fiscalAddress", "Dirección fiscal", { area: true })}
      <div className="pair">
        {field("paymentTerms", "Forma de pago habitual", { area: true })}
        {field("exclusions", "Exclusiones habituales", { area: true })}
      </div>
      {field("notes", "Observaciones", { area: true })}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn pri" disabled={pending}>{client ? "Guardar" : "Crear cliente"}</button>
        <Link className="btn" href={cancelHref}>Cancelar</Link>
        <Err msg={e._} />
      </div>
    </form>
  );
}

export function ClientDangerZone({ client }: { client: ClientValues }) {
  const [removed, remove, removing] = useActionState<ClientActionResult | null, FormData>(removeClientAction, null);
  const [toggled, toggle, toggling] = useActionState<ActionResult | null, FormData>(setClientActiveAction, null);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <form action={toggle}>
        <input type="hidden" name="id" value={client.id} />
        <input type="hidden" name="active" value={client.active ? "0" : "1"} />
        <button className={client.active ? "btn warn" : "btn"} disabled={toggling}>{client.active ? "Desactivar" : "Reactivar"}</button>
      </form>
      <form action={remove}>
        <input type="hidden" name="id" value={client.id} />
        <button className="btn" disabled={removing}>Eliminar cliente</button>
      </form>
      {removed?.ok && removed.outcome === "deactivated" && <span className="mut" role="status">Desactivado porque tiene presupuestos</span>}
      <span className="err" hidden={!(errorsOf(removed)._ ?? errorsOf(toggled)._)}>{errorsOf(removed)._ ?? errorsOf(toggled)._}</span>
    </div>
  );
}

type RowKind = "contact" | "location";
const ROW = {
  contact: {
    save: saveContactAction, remove: removeContactAction, title: "contacto",
    fields: [["name", "Nombre"], ["role", "Cargo"], ["email", "Email"], ["phone", "Teléfono"]],
  },
  location: {
    save: saveLocationAction, remove: removeLocationAction, title: "instalación",
    fields: [["name", "Nombre"], ["address", "Dirección"], ["installation", "Instalación"], ["country", "País"]],
  },
} as const;

function EditableRow({ kind, clientId, row }: { kind: RowKind; clientId: string; row?: Record<string, string | boolean> }) {
  const cfg = ROW[kind];
  const [saved, save, saving] = useActionState<ActionResult | null, FormData>(cfg.save, null);
  const [removed, remove, removing] = useActionState<ActionResult | null, FormData>(cfg.remove, null);
  const e = { ...errorsOf(saved), ...errorsOf(removed) };
  return (
    <form onSubmit={keep((data) => (data.get("op") === "remove" ? remove(data) : save(data)))} className="rowform" style={row && !row.active ? { opacity: 0.6 } : undefined}>
      <input type="hidden" name="clientId" value={clientId} />
      {row && <input type="hidden" name="id" value={String(row.id)} />}
      {cfg.fields.map(([name, label]) => (
        <input key={name} name={name} aria-label={label} placeholder={label} defaultValue={row ? String(row[name] ?? "") : ""}
          required={name === "name"} type={name === "email" ? "email" : "text"} />
      ))}
      <span style={{ display: "flex", gap: 6 }}>
        <button className={row ? "btn" : "btn pri"} disabled={saving} style={{ minHeight: 36, padding: "4px 10px" }}>{row ? "Guardar" : "Añadir"}</button>
        {row && <button className="btn" name="op" value="remove" disabled={removing} style={{ minHeight: 36, padding: "4px 10px" }}>Eliminar</button>}
      </span>
      {Object.values(e).length > 0 && <span className="msg" role="alert">{Object.values(e).join(" ")}</span>}
      {row && !row.active && <span className="mut" style={{ gridColumn: "1/-1", fontSize: 12 }}>Desactivado: lo usan presupuestos existentes.</span>}
    </form>
  );
}

/** Contacts or installations (work locations): each row edits in place; the last row adds a new one. */
export function EditableRows({ kind, clientId, rows }: { kind: RowKind; clientId: string; rows: (ContactValues | LocationValues)[] }) {
  const cfg = ROW[kind];
  return (
    <div>
      <div className="rowhead">{cfg.fields.map(([n, l]) => <span key={n}>{l}</span>)}<span /></div>
      {rows.map((r) => <EditableRow key={JSON.stringify(r)} kind={kind} clientId={clientId} row={r} />)}
      {/* Keyed by the row count so the empty "add" row clears itself after a successful add. */}
      <EditableRow key={`new-${rows.length}`} kind={kind} clientId={clientId} />
      {rows.length === 0 && <p className="mut" style={{ fontSize: 12, marginTop: 6 }}>Sin {cfg.title === "contacto" ? "contactos" : "instalaciones"} todavía.</p>}
    </div>
  );
}
