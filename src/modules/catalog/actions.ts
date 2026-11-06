"use server";

import { revalidatePath } from "next/cache";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/modules/auth/session";
import * as lists from "./lists";
import * as catalog from "./service";
import { MAX_IMPORT_BYTES } from "./excel";
import { importConcepts, type ImportResult } from "./import";

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

export async function setConceptActiveAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  return run(CATALOG, () => catalog.setConceptActive(actor, String(form.get("id")), form.get("active") === "1"));
}

export type RemoveResult = ActionResult & { outcome?: "deleted" | "deactivated" };

export async function removeConceptAction(_prev: RemoveResult | null, form: FormData): Promise<RemoveResult> {
  const actor = await requireUser();
  let outcome: "deleted" | "deactivated" = "deleted";
  const result = await run(CATALOG, async () => { outcome = await catalog.removeConcept(actor, String(form.get("id"))); });
  return result.ok ? { ok: true, outcome } : result;
}

export type ImportState = { ok: false; errors: Record<string, string> } | ({ ok: true } & ImportResult) | null;

/** Preview and confirm both receive the file: the server keeps nothing between the two steps. */
async function runImport(form: FormData, apply: boolean): Promise<ImportState> {
  const actor = await requireUser();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: { file: "Elige un archivo .xlsx" } };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, errors: { file: "El archivo no puede pasar de 2 MB" } };
  let result: ImportResult | undefined;
  const r = await toActionResult(async () => { result = await importConcepts(actor, new Uint8Array(await file.arrayBuffer()), { apply }); });
  if (!r.ok) return r;
  if (result!.applied) revalidatePath("/catalogo");
  return { ok: true, ...result! };
}

export async function previewImportAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  return runImport(form, false);
}

export async function applyImportAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  return runImport(form, true);
}
