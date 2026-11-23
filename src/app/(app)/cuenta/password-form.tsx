"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/action-result";
import { changePasswordAction } from "@/modules/account/actions";

export function PasswordForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(changePasswordAction, null);
  const errors = state && !state.ok ? state.errors : {};
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  const field = (name: string, label: string, autoComplete: string) => (
    <label className="field">
      {label}
      <input type="password" name={name} autoComplete={autoComplete} required />
      {errors[name] && <span className="msg" role="alert">{errors[name]}</span>}
    </label>
  );
  return (
    <form ref={ref} action={action} className="sheet stack" aria-busy={pending}>
      <h2 style={{ margin: 0 }}>Contraseña</h2>
      {field("current", "Contraseña actual", "current-password")}
      {field("next", "Contraseña nueva", "new-password")}
      {field("repeat", "Repite la nueva", "new-password")}
      <p className="mut" style={{ fontSize: 13 }}>Al cambiarla se cierran tus sesiones en otros equipos.</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn pri" disabled={pending}>Cambiar contraseña</button>
        {state?.ok && <span className="okmsg" role="status">Contraseña cambiada</span>}
        {errors._ && <span className="msg" role="alert">{errors._}</span>}
      </div>
    </form>
  );
}
