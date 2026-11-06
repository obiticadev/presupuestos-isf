import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ForbiddenError } from "@/lib/errors";
import { auth } from "./auth";
import { assertAdmin } from "./permissions";

export type Role = "admin" | "presupuestador";
export type CurrentUser = { id: string; name: string; email: string; role: Role };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role: role === "admin" ? "admin" : "presupuestador" };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}

export { ForbiddenError };
