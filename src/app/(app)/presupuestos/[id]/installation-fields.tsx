"use client";

import { useState } from "react";

export type InstallationOption = { id: string; name: string; label: string };

/** «Nombre» picks the installation; «Instalación» shows its «instalación · país» as soon as it changes (saved with the header). */
export function InstallationFields({ options, current }: { options: InstallationOption[]; current: string | null }) {
  const [id, setId] = useState(current ?? "");
  return (
    <>
      <label className="field">Nombre
        <select name="locationId" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">— Sin elegir —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      {/* Not an input: nothing to type here, so no caret and no focus. */}
      <div className="field">Instalación
        <output className="box" aria-live="polite">{options.find((o) => o.id === id)?.label ?? "—"}</output>
      </div>
    </>
  );
}
