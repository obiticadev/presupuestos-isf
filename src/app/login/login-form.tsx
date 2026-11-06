"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/modules/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action}>
      {/* eslint-disable-next-line @next/next/no-img-element -- provisional 220 px JPG, nothing to optimise */}
      <img src="/logo-isf.jpg" alt="ISF · Instalaciones, Servicios y Formación, S.L." width={160} style={{ marginBottom: 8 }} />
      <h1 style={{ fontSize: 34 }}>Entrar</h1>
      {state.error && <p className="err" role="alert">{state.error}</p>}
      <label className="field">
        Email
        <input type="email" name="email" required autoComplete="username" defaultValue={state.email} />
      </label>
      <label className="field">
        Contraseña
        <input type="password" name="password" required autoComplete="current-password" />
      </label>
      <button className="btn pri" disabled={pending} style={{ justifyContent: "center", minHeight: 46, fontSize: 15 }}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <p className="mut" style={{ fontSize: 13 }}>
        ¿Has olvidado la contraseña? Pide a un administrador que te la restablezca.
      </p>
    </form>
  );
}
