import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/modules/auth/session";
import { createClient, saveContact, saveLocation } from "@/modules/clients/service";
import { createDraft, getQuote } from "@/modules/quotes/service";
import { makeUser } from "./users";

/** A client with one location and one contact. */
export async function makeClient(actor: CurrentUser, over: { paymentTerms?: string; exclusions?: string; offerValidityDays?: string } = {}) {
  const client = await createClient(actor, { legalName: `Cliente ${randomUUID().slice(0, 6)}`, taxId: `B${randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0")}`, ...over });
  const location = await saveLocation(actor, client.id, { name: "Nave 3", city: "Torrejón de Ardoz" });
  const contact = await saveContact(actor, client.id, { name: "Ana", email: "" });
  return { client, location, contact };
}

/** A draft for a fresh client; `sub` is subsection 1.1. */
export async function makeDraft(opts: { clientOver?: Parameters<typeof makeClient>[1] } = {}) {
  const actor = await makeUser("presupuestador");
  const admin = await makeUser("admin");
  const { client, location, contact } = await makeClient(actor, opts.clientOver);
  const quote = await createDraft(actor, { clientId: client.id });
  const detail = await getQuote(quote.id);
  const section = detail.sections[0];
  return { actor, admin, client, location, contact, quote, section, sub: section.children[0] };
}

/** The fields updateConcept needs, copied from a concept, so a test can change only the price. */
export const conceptFields = (c: { code: string; categoryId: string; unitId: string; taxId: string; description: string; validated: boolean }) => ({
  code: c.code, categoryId: c.categoryId, unitId: c.unitId, taxId: c.taxId, description: c.description, validated: c.validated,
});
