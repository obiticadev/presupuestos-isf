"use client";

import { useState } from "react";
import { Combobox } from "@/components/combobox";

export type InstallationOption = { id: string; name: string; label: string; installation: string; address: string };

/** «Nombre» picks the installation; «Instalación» shows its «instalación · país» as soon as it changes (saved with the header). */
export function InstallationFields({ options, current }: { options: InstallationOption[]; current: string | null }) {
  const [id, setId] = useState(current ?? "");
  return (
    <>
      <label className="field">Nombre
        <Combobox name="locationId" value={id} onPick={setId} label="Nombre" placeholder="Nombre, instalación o dirección"
          items={options.map((o) => ({ id: o.id, code: o.name, description: o.installation, extra: o.address, text: o.name }))} />
      </label>
      {/* Not an input: nothing to type or select; it takes focus only to show the same outline as its neighbours. */}
      <div className="field">Instalación
        <output className="box" aria-live="polite" tabIndex={0}>{options.find((o) => o.id === id)?.label ?? "—"}</output>
      </div>
    </>
  );
}
