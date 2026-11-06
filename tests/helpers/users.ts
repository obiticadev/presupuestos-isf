import { randomUUID } from "node:crypto";
import { auth } from "@/modules/auth/auth";
import type { CurrentUser, Role } from "@/modules/auth/session";

/** Creates a user through Better Auth, the same path the app uses. */
export async function makeUser(role: Role, opts: { email?: string; password?: string } = {}): Promise<CurrentUser> {
  const email = opts.email ?? `${role}-${randomUUID().slice(0, 8)}@isf.test`;
  const name = email.split("@")[0];
  const { user } = await auth.api.createUser({
    body: { email, name, password: opts.password ?? "contraseña-larga-1", role },
  });
  return { id: user.id, name, email, role };
}
