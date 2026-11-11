"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/modules/auth/session";
import { addKitInstance, removeKitInstance, updateKitInstance } from "./kit-instances";
import * as quotes from "./service";

// Thin wrappers: read the form, call the service (which checks the draft and logs), refresh the pages that show quotes.

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
/** Only the fields present in the form, so each editor block saves just its own fields. */
const present = (f: FormData, keys: string[]) => Object.fromEntries(keys.filter((k) => f.has(k)).map((k) => [k, str(f, k)]));
const dir = (f: FormData) => (str(f, "dir") === "-1" ? -1 : 1);

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  const result = await toActionResult(fn);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
const action = (fn: (actor: Awaited<ReturnType<typeof requireUser>>, form: FormData) => Promise<unknown>): Action =>
  async (_prev, form) => {
    const actor = await requireUser();
    return run(() => fn(actor, form));
  };

export async function createDraftAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  let id = "";
  const result = await toActionResult(async () => { id = (await quotes.createDraft(actor, { clientId: str(form, "clientId") })).id; });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  redirect(`/presupuestos/${id}`);
}

export async function deleteDraftAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const result = await toActionResult(() => quotes.deleteDraft(actor, str(form, "id")));
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  redirect("/");
}

export const updateHeaderAction: Action = action((actor, f) =>
  quotes.updateHeader(actor, str(f, "id"), present(f, ["clientId", "locationId", "contactId", "ownerId", "date", "subject", "paymentTerms", "exclusions", "validityDays", "travelNote"])));

export const addSectionAction: Action = action((actor, f) =>
  quotes.addSection(actor, str(f, "quoteId"), { parentId: str(f, "parentId") || undefined, title: str(f, "title") }));
export const updateSectionAction: Action = action((actor, f) =>
  quotes.updateSection(actor, str(f, "id"), present(f, ["title", "mode", "globalQty", "globalPrice", "taxId"])));
export const moveSectionAction: Action = action((actor, f) => quotes.moveSection(actor, str(f, "id"), dir(f)));
export const removeSectionAction: Action = action((actor, f) => quotes.removeSection(actor, str(f, "id")));

export const addCatalogLineAction: Action = action((actor, f) =>
  quotes.addCatalogLine(actor, str(f, "subsectionId"), { conceptId: str(f, "conceptId"), quantity: str(f, "quantity") }));
export const addCustomLineAction: Action = action((actor, f) =>
  quotes.addCustomLine(actor, str(f, "subsectionId"), {
    description: str(f, "description"), unitName: str(f, "unitName"), quantity: str(f, "quantity"),
    unitPrice: str(f, "unitPrice"), taxId: str(f, "taxId"),
  }));
export const updateLineAction: Action = action((actor, f) =>
  quotes.updateLine(actor, str(f, "id"), {
    ...present(f, ["description", "quantity"]),
    ...(f.has("visible") && { visible: str(f, "visible") === "1" }),
  }));
export const moveLineAction: Action = action((actor, f) => quotes.moveLine(actor, str(f, "id"), dir(f)));
export const removeLineAction: Action = action((actor, f) => quotes.removeLine(actor, str(f, "id")));
export const adjustPriceAction: Action = action((actor, f) =>
  quotes.adjustPrice(actor, str(f, "id"), { newPrice: str(f, "newPrice"), reason: str(f, "reason") }));

export const setCommentAction: Action = action((actor, f) =>
  quotes.setComment(actor, { kind: str(f, "kind") as "line" | "kit" | "section", id: str(f, "id"), comment: str(f, "comment") }));

/** Kit data arrive as param.<key> and choice.<slot>. */
const kitFields = (f: FormData) => {
  const pick = (prefix: string) => Object.fromEntries([...f.keys()].filter((k) => k.startsWith(prefix)).map((k) => [k.slice(prefix.length), str(f, k)]));
  return { quantity: str(f, "quantity"), params: pick("param."), choices: pick("choice.") };
};
export const addKitAction: Action = action((actor, f) =>
  addKitInstance(actor, str(f, "subsectionId"), { templateId: str(f, "templateId"), ...kitFields(f) }));
export const updateKitAction: Action = action((actor, f) => updateKitInstance(actor, str(f, "id"), kitFields(f)));
export const removeKitAction: Action = action((actor, f) => removeKitInstance(actor, str(f, "id")));

export const setWaiverAction: Action = action((actor, f) =>
  quotes.setWaiver(actor, str(f, "quoteId"), str(f, "conceptId"), f.get("clear") === "1" ? null : str(f, "reason")));

export const issueAction: Action = action(async (actor, f) => {
  const q = await (await import("./issue")).issueQuote(actor, str(f, "id"));
  // The issue stands even if the PDF fails: the download regenerates it from the snapshot.
  await (await import("./pdf")).ensureIssuedPdf(actor, q.id).catch((e) => console.error(`pdf: no se pudo generar el PDF de ${q.reference}`, e));
});
export const setStatusAction: Action = action(async (actor, f) =>
  (await import("./lifecycle")).setStatus(actor, str(f, "id"), str(f, "status") as Parameters<typeof import("./lifecycle").setStatus>[2]));
export const refreshPricesAction: Action = action(async (actor, f) => (await import("./lifecycle")).refreshPricesFromCatalog(actor, str(f, "id")));
export const addRequiredConceptAction: Action = action((actor, f) => quotes.addRequiredConcept(actor, str(f, "conceptId")));
export const removeRequiredConceptAction: Action = action((actor, f) => quotes.removeRequiredConcept(actor, str(f, "conceptId")));

export async function createRevisionAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const { createRevision } = await import("./lifecycle");
  let id = "";
  const result = await toActionResult(async () => { id = (await createRevision(actor, str(form, "id"))).id; });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  redirect(`/presupuestos/${id}`);
}

export async function duplicateAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const { duplicateQuote } = await import("./lifecycle");
  let id = "";
  const result = await toActionResult(async () => { id = (await duplicateQuote(actor, str(form, "id"))).quote.id; });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  redirect(`/presupuestos/${id}`);
}
