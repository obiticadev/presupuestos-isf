"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/modules/auth/session";
import * as clients from "./service";

export type ClientActionResult = ActionResult & { id?: string; outcome?: "deleted" | "deactivated" };

const s = (form: FormData, key: string) => String(form.get(key) ?? "");

async function run(clientId: string, fn: () => Promise<unknown>): Promise<ActionResult> {
  const result = await toActionResult(fn);
  if (result.ok) {
    revalidatePath("/clientes");
    if (clientId) revalidatePath(`/clientes/${clientId}`);
  }
  return result;
}

const clientArgs = (form: FormData) => ({
  legalName: s(form, "legalName"), taxId: s(form, "taxId"), tradeName: s(form, "tradeName"),
  fiscalAddress: s(form, "fiscalAddress"), notes: s(form, "notes"), paymentTerms: s(form, "paymentTerms"),
  exclusions: s(form, "exclusions"), offerValidityDays: s(form, "offerValidityDays"),
});

/** Creates (no id) or updates the client; returns its id so a new one can open its page. */
export async function saveClientAction(_prev: ClientActionResult | null, form: FormData): Promise<ClientActionResult> {
  const actor = await requireUser();
  const id = s(form, "id");
  let savedId = id;
  const result = await run(id, async () => {
    savedId = id ? (await clients.updateClient(actor, id, clientArgs(form))).id : (await clients.createClient(actor, clientArgs(form))).id;
  });
  return result.ok ? { ok: true, id: savedId } : result;
}

export async function setClientActiveAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const id = s(form, "id");
  return run(id, () => clients.setClientActive(actor, id, s(form, "active") === "1"));
}

export async function removeClientAction(_prev: ClientActionResult | null, form: FormData): Promise<ClientActionResult> {
  const actor = await requireUser();
  const id = s(form, "id");
  let outcome: "deleted" | "deactivated" = "deleted";
  const result = await run(id, async () => { outcome = await clients.removeClient(actor, id); });
  return result.ok ? { ok: true, outcome } : result;
}

export async function saveContactAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const clientId = s(form, "clientId");
  return run(clientId, () => clients.saveContact(actor, clientId, {
    id: s(form, "id") || undefined, name: s(form, "name"), role: s(form, "role"), email: s(form, "email"), phone: s(form, "phone"),
  }));
}

export async function saveLocationAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const clientId = s(form, "clientId");
  return run(clientId, () => clients.saveLocation(actor, clientId, {
    id: s(form, "id") || undefined, name: s(form, "name"), address: s(form, "address"), installation: s(form, "installation"), country: s(form, "country"),
  }));
}

export async function removeContactAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(s(form, "clientId"), () => clients.removeContact(actor, s(form, "id")));
}

export async function removeLocationAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(s(form, "clientId"), () => clients.removeLocation(actor, s(form, "id")));
}
