"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/modules/auth/session";
import * as lists from "./lists";

async function run(paths: string[], fn: () => Promise<unknown>): Promise<ActionResult> {
  const result = await toActionResult(fn);
  if (result.ok) paths.forEach((p) => revalidatePath(p));
  return result;
}

const LIST_PATHS = ["/admin/configuracion", "/catalogo"];
const listArgs = (form: FormData) => ({ id: String(form.get("id") ?? "") || undefined, name: String(form.get("name") ?? "") });

export async function saveCategoryAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(LIST_PATHS, () => lists.saveCategory(actor, listArgs(form)));
}

export async function setCategoryActiveAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(LIST_PATHS, () => lists.setCategoryActive(actor, String(form.get("id")), form.get("active") === "1"));
}

export async function saveUnitAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(LIST_PATHS, () => lists.saveUnit(actor, listArgs(form)));
}

export async function setUnitActiveAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(LIST_PATHS, () => lists.setUnitActive(actor, String(form.get("id")), form.get("active") === "1"));
}
