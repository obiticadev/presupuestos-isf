"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/modules/auth/session";
import * as lists from "./lists";
import * as catalog from "./service";
import { importFile } from "@/lib/import-file";
import type { ImportState } from "@/components/import-form";
import { importConcepts } from "./import";

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

export async function deleteCategoryAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(LIST_PATHS, () => lists.deleteCategory(actor, String(form.get("id"))));
}

export async function deleteUnitAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(LIST_PATHS, () => lists.deleteUnit(actor, String(form.get("id"))));
}

const CATALOG = ["/catalogo"];

/** Reads the concept form; checkboxes arrive only when ticked. */
function conceptArgs(form: FormData) {
  const s = (k: string) => String(form.get(k) ?? "");
  return {
    code: s("code"), categoryId: s("categoryId"), description: s("description"), unitId: s("unitId"), taxId: s("taxId"),
    salePrice: s("salePrice"), cost: s("cost"), listPrice: s("listPrice"), discountPct: s("discountPct"),
    validated: form.get("validated") === "on", notes: s("notes"),
    manufacturer: s("manufacturer"), supplierRef: s("supplierRef"), supplier: s("supplier"),
  };
}

export type SaveConceptResult = ActionResult & { id?: string };

export async function saveConceptAction(_prev: SaveConceptResult | null, form: FormData): Promise<SaveConceptResult> {
  const actor = await requireUser();
  const id = String(form.get("id") ?? "");
  let savedId = id;
  const result = await run(CATALOG, async () => {
    savedId = id ? (await catalog.updateConcept(actor, id, conceptArgs(form))).id : (await catalog.createConcept(actor, conceptArgs(form))).id;
  });
  return result.ok ? { ok: true, id: savedId } : result;
}

export async function setConceptActiveAction(_prev: ToggleResult | null, form: FormData): Promise<ToggleResult> {
  const actor = await requireUser();
  let incompleteKits: string[] = [];
  const result = await run(CATALOG, async () => { incompleteKits = (await catalog.setConceptActive(actor, String(form.get("id")), form.get("active") === "1")).incompleteKits; });
  return result.ok ? { ok: true, incompleteKits } : result;
}

export type ToggleResult = ActionResult & { incompleteKits?: string[] };
export type RemoveResult = ToggleResult & { outcome?: "deleted" | "deactivated" };

export async function removeConceptAction(_prev: RemoveResult | null, form: FormData): Promise<RemoveResult> {
  const actor = await requireUser();
  let removal: Awaited<ReturnType<typeof catalog.removeConcept>> = { outcome: "deleted", incompleteKits: [] };
  const result = await run(CATALOG, async () => { removal = await catalog.removeConcept(actor, String(form.get("id"))); });
  return result.ok ? { ok: true, ...removal } : result;
}

/** «Revisar» and «Confirmar importación» of the catalog (open to everyone). */
export async function importCatalogAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const actor = await requireUser();
  return importFile(form, "/catalogo", (bytes, opts) => importConcepts(actor, bytes, opts));
}
