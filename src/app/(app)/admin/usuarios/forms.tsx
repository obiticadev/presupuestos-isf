"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import type { Role } from "@/modules/auth/session";
import { createUserAction, resetPasswordAction, setActiveAction, setRoleAction } from "@/modules/users/actions";

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
const errorsOf = (s: ActionResult | null) => (s && !s.ok ? s.errors : {});

function FieldError({ msg }: { msg?: string }) {
  return msg ? <span className="msg" role="alert">{msg}</span> : null;
}

export function NewUserForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createUserAction, null);
  const e = errorsOf(state);
  return (
    <details className="sheet" style={{ marginTop: 18 }} open={!!state && !state.ok}>
      <summary className="btn pri" style={{ listStyle: "none" }}>Nuevo usuario</summary>
      <form action={action} className="filters" style={{ alignItems: "flex-start" }}>
        <label className="field">Nombre<input name="name" required maxLength={100} /><FieldError msg={e.name} /></label>
        <label className="field">Email<input name="email" type="email" required /><FieldError msg={e.email} /></label>
        <label className="field">
          Rol
          <select name="role" defaultValue="presupuestador">
            <option value="presupuestador">Presupuestador</option>
            <option value="admin">Administrador</option>
          </select>
          <FieldError msg={e.role} />
        </label>
        <label className="field">
          Contraseña inicial
          <input name="password" type="password" required minLength={10} autoComplete="new-password" />
          <FieldError msg={e.password} />
        </label>
        <button className="btn pri" disabled={pending} style={{ alignSelf: "flex-end" }}>Crear usuario</button>
        <FieldError msg={e._} />
      </form>
    </details>
  );
}

function RowForm({ action, children }: { action: Action; children: (pending: boolean) => React.ReactNode }) {
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const e = errorsOf(state);
  return (
    <form action={run} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {children(pending)}
      <FieldError msg={e._ ?? e.password ?? e.role} />
      {state?.ok && <span className="mut" role="status">Guardado</span>}
    </form>
  );
}

export function RoleForm({ userId, role }: { userId: string; role: Role }) {
  return (
    <RowForm action={setRoleAction}>
      {(pending) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <select name="role" defaultValue={role} aria-label="Rol" style={{ minHeight: 34, font: "inherit", border: "1.5px solid var(--ink)", padding: "4px 6px" }}>
            <option value="presupuestador">Presupuestador</option>
            <option value="admin">Administrador</option>
          </select>
          <button className="btn" disabled={pending} style={{ minHeight: 34, padding: "4px 10px" }}>Cambiar rol</button>
        </>
      )}
    </RowForm>
  );
}

export function ActiveForm({ userId, active }: { userId: string; active: boolean }) {
  return (
    <RowForm action={setActiveAction}>
      {(pending) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="active" value={active ? "0" : "1"} />
          <button className={active ? "btn warn" : "btn"} disabled={pending} style={{ minHeight: 34, padding: "4px 10px" }}>
            {active ? "Desactivar" : "Reactivar"}
          </button>
        </>
      )}
    </RowForm>
  );
}

export function PasswordForm({ userId }: { userId: string }) {
  return (
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Restablecer contraseña</summary>
      <RowForm action={resetPasswordAction}>
        {(pending) => (
          <>
            <input type="hidden" name="userId" value={userId} />
            <input name="password" type="password" required minLength={10} autoComplete="new-password" aria-label="Nueva contraseña"
              placeholder="Nueva contraseña" style={{ minHeight: 34, font: "inherit", border: "1.5px solid var(--ink)", padding: "4px 8px" }} />
            <button className="btn" disabled={pending} style={{ minHeight: 34, padding: "4px 10px" }}>Guardar</button>
          </>
        )}
      </RowForm>
    </details>
  );
}
