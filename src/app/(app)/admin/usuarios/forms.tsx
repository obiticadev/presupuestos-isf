"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ConfirmButton, SubmitOnBlur } from "@/components/action-form";
import type { ActionResult } from "@/lib/action-result";
import type { Role } from "@/modules/auth/session";
import { createUserAction, deleteUserAction, renameUserAction, resetPasswordAction, setActiveAction, setRoleAction } from "@/modules/users/actions";

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
const errorsOf = (s: ActionResult | null) => (s && !s.ok ? s.errors : {});

function FieldError({ msg }: { msg?: string }) {
  return msg ? <span className="msg" role="alert">{msg}</span> : null;
}

export function NewUserForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createUserAction, null);
  const e = errorsOf(state);
  const form = useRef<HTMLFormElement>(null);
  // Submitted via onSubmit, not `action`, so React keeps what was typed when the server rejects it.
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <details className="sheet" style={{ marginTop: 18 }} open={!!state && !state.ok}>
      <summary className="btn pri" style={{ listStyle: "none" }}>Nuevo usuario</summary>
      <form
        ref={form}
        onSubmit={(ev) => { ev.preventDefault(); const data = new FormData(ev.currentTarget); startTransition(() => action(data)); }}
        className="filters" style={{ alignItems: "flex-start" }}
      >
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
  // «Guardado» is derived from the result and hidden 2,5 s later (as in ActionForm), so the effect never sets state synchronously.
  const [expired, setExpired] = useState<ActionResult | null>(null);
  const saved = state?.ok && expired !== state;
  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => setExpired(state), 2500);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <form action={run} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {children(pending)}
      <FieldError msg={e._ ?? e.password ?? e.role ?? e.name} />
      {saved && <span role="status" style={{ color: "var(--ok)", fontWeight: 600 }}>Guardado</span>}
    </form>
  );
}

export function RoleForm({ userId, role }: { userId: string; role: Role }) {
  return (
    <RowForm action={setRoleAction}>
      {(pending) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <select name="role" defaultValue={role} aria-label="Rol" style={{ width: 150, minHeight: 34, font: "inherit", border: "1.5px solid var(--ink)", padding: "4px 6px" }}>
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

/** Saved when the field loses focus; only offered while the user has nothing issued. */
export function NameForm({ userId, name }: { userId: string; name: string }) {
  return (
    <RowForm action={renameUserAction}>
      {() => (
        <SubmitOnBlur>
          <input type="hidden" name="userId" value={userId} />
          <input name="name" defaultValue={name} required maxLength={100} aria-label="Nombre"
            style={{ minHeight: 34, font: "inherit", fontWeight: 600, border: "1.5px solid var(--ink)", padding: "4px 8px", background: "var(--sheet)" }} />
        </SubmitOnBlur>
      )}
    </RowForm>
  );
}

export function DeleteForm({ userId, name, drafts }: { userId: string; name: string; drafts: number }) {
  return (
    <RowForm action={deleteUserAction}>
      {() => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <ConfirmButton label="Eliminar" className="btn danger" confirm={`¿Eliminar a ${name}?${drafts === 1 ? " Su borrador pasará a ti" : drafts ? ` Sus ${drafts} borradores pasarán a ti` : ""}`} />
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
