"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/modules/auth/session";
import * as kits from "./service";

export type SaveKitResult = ActionResult & { id?: string };

/** The form sends the definition as JSON in a hidden field; the service validates it with Zod. */
export async function saveKitAction(_prev: SaveKitResult | null, form: FormData): Promise<SaveKitResult> {
  const actor = await requireUser();
  let definition: unknown;
  try {
    definition = JSON.parse(String(form.get("definition") ?? ""));
  } catch {
    return { ok: false, errors: { _: "La definición del conjunto no es válida" } };
  }
  let id = "";
  const result = await toActionResult(async () => {
    id = (await kits.saveKit(actor, {
      id: String(form.get("id") ?? "") || undefined,
      name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""),
      definition: definition as kits.KitInput["definition"],
    })).id;
  });
  if (!result.ok) return result;
  revalidatePath("/conjuntos");
  return { ok: true, id };
}

export async function setKitActiveAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const result = await toActionResult(() => kits.setKitActive(actor, String(form.get("id")), form.get("active") === "1"));
  if (result.ok) revalidatePath("/conjuntos");
  return result;
}
