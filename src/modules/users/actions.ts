"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { requireUser, type Role } from "@/modules/auth/session";
import * as users from "./service";

const PATH = "/admin/usuarios";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  const result = await toActionResult(fn);
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function createUserAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(() =>
    users.createUser(actor, {
      name: text(form, "name"),
      email: text(form, "email"),
      role: text(form, "role") as Role,
      password: text(form, "password"),
    }),
  );
}

export async function setRoleAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(() => users.setRole(actor, text(form, "userId"), text(form, "role") as Role));
}

export async function setActiveAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const userId = text(form, "userId");
  return run(() => (text(form, "active") === "1" ? users.reactivateUser(actor, userId) : users.deactivateUser(actor, userId)));
}

export async function renameUserAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(() => users.renameUser(actor, text(form, "userId"), text(form, "name")));
}

export async function deleteUserAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(() => users.deleteUser(actor, text(form, "userId")));
}

export async function resetPasswordAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(() => users.adminResetPassword(actor, text(form, "userId"), text(form, "password")));
}
