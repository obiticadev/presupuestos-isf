"use client";

import { useRef, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Combobox } from "@/components/combobox";
import { changeKitAction } from "@/modules/quotes/actions";

/**
 * A fixed material's measure (spec 2026-11-24 §3): grey and read-only until ✎; saved on leaving it. When it differs from
 * the kit's, it goes amber with a warning and «Volver al original», which empties it (the server drops an empty one).
 * The warning is a row of its own in the tree, so the tree's line runs on beside it.
 */
export function FixedMeasure({ name, value, original, unit, changed, last, label }: {
  name: string; value: string; original: string; unit: string; changed: boolean; last: boolean; label: string;
}) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="kq-m">
        <input
          // key: «Volver al original» empties it by hand, so a new saved value needs a fresh field
          key={value} ref={input} name={name} defaultValue={value} inputMode="decimal" readOnly={!editing && !changed}
          className={changed ? "changed" : undefined} aria-label={`${label}: medida`}
          onBlur={(e) => { setEditing(false); if (e.target.value.trim() !== e.target.defaultValue) e.target.form?.requestSubmit(); }}
        />
        <small title={unit}>{unit}</small>
        <button type="button" className="kq-pen" title="Cambiar la medida solo en este borrador" aria-label={`Cambiar la medida de ${label} solo en este borrador`}
          onClick={() => { setEditing(true); requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); }); }}>✎</button>
      </div>
      {changed && (
        <div className={`kq-r kq-wn${last ? " kq-lwn" : ""}`}>
          <div className="kq-n" aria-hidden />
          <div className="kq-warn" role="status">
            <span>⚠ Medida cambiada solo en este borrador; el conjunto dice {original}.</span>
            <button type="button" onClick={() => { if (input.current) { input.current.value = ""; input.current.form?.requestSubmit(); } }}>Volver al original</button>
          </div>
        </div>
      )}
    </>
  );
}

/** «Cambiar conjunto» (spec §4): a search over the other active kits; what both kits share is kept by the server. */
export function KitSwap({ kitId, kits }: { kitId: string; kits: { id: string; name: string; description: string }[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("");
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>Cambiar conjunto</button>;
  return (
    <ActionForm action={changeKitAction} className="kswap" onSaved={() => setOpen(false)}>
      <input type="hidden" name="id" value={kitId} />
      <Combobox items={kits.map((k) => ({ id: k.id, code: k.name, description: k.description }))} value="" name="templateId"
        onPick={setPicked} placeholder="Busca otro conjunto…" label="Conjunto nuevo" autoFocus />
      <button className="btn pri" disabled={!picked}>Cambiar</button>
      <button type="button" className="btn" aria-label="Cerrar" onClick={() => setOpen(false)}>✕</button>
      <p>Se conservan la cantidad y el comentario, y lo elegido o escrito en los elementos que el nuevo conjunto también tenga. Lo demás se vuelve a pedir.</p>
    </ActionForm>
  );
}
