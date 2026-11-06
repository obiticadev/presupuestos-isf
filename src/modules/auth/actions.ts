"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type SignInState = { error?: string; email?: string };

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    if (error instanceof APIError && error.body?.code === "BANNED_USER") {
      return { email, error: "Usuario desactivado. Contacta con un administrador." };
    }
    if (error instanceof APIError) return { email, error: "Email o contraseña incorrectos." };
    throw error;
  }
  redirect("/");
}

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
