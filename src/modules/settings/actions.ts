"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/modules/auth/session";
import type { SettingsInput } from "./schema";
import * as settings from "./service";

const PATH = "/admin/configuracion";

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  const result = await toActionResult(fn);
  if (result.ok) revalidatePath(PATH);
  return result;
}

/** Saves only the fields the submitted form section contains. */
export async function updateSettingsAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const input = Object.fromEntries([...form.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string"));
  return run(() => settings.updateSettings(actor, input as SettingsInput));
}

export async function saveLogoAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: { logo: "Elige un archivo" } };
  return run(async () =>
    settings.saveLogo(actor, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }),
  );
}

export async function saveTaxAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(() =>
    settings.saveTax(actor, {
      id: String(form.get("id") ?? "") || undefined,
      name: String(form.get("name") ?? ""),
      ratePct: String(form.get("ratePct") ?? ""),
      isDefault: form.get("isDefault") === "on",
    }),
  );
}

export async function setTaxActiveAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(() => settings.setTaxActive(actor, String(form.get("id")), form.get("active") === "1"));
}
