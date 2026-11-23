"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/auth/session";
import * as account from "./service";

const PATH = "/cuenta";
const PNG_DATA_URL = "data:image/png;base64,";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  const result = await toActionResult(fn);
  if (result.ok) revalidatePath(PATH);
  return result;
}

/** Receives the canvas export (`data:image/png;base64,…`). */
export async function saveSignatureAction(dataUrl: string): Promise<ActionResult> {
  const actor = await requireUser();
  return run(async () => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_DATA_URL)) throw new ValidationError({ signature: "La firma debe ser una imagen PNG" });
    await account.saveSignature(actor, Buffer.from(dataUrl.slice(PNG_DATA_URL.length), "base64"));
  });
}

export async function deleteSignatureAction(): Promise<ActionResult> {
  const actor = await requireUser();
  return run(() => account.deleteSignature(actor));
}

export async function changePasswordAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const h = await headers();
  return run(() => account.changeOwnPassword(actor, { current: text(form, "current"), next: text(form, "next"), repeat: text(form, "repeat") }, h));
}
