import { revalidatePath } from "next/cache";
import { toActionResult } from "@/lib/action-result";
import type { ImportOptions } from "@/lib/import-result";
import { MAX_IMPORT_BYTES } from "@/modules/catalog/excel";

/**
 * Body of an import Server Action: checks the uploaded file and runs `run` with `apply` = «Confirmar» was pressed, `mode` and `keep` (client ids to leave as they are).
 * Preview and confirm both receive the file: the server keeps nothing between the two steps.
 */
export async function importFile<R extends { applied: boolean }>(
  form: FormData, path: string, run: (bytes: Uint8Array, opts: ImportOptions) => Promise<R>,
): Promise<{ ok: false; errors: Record<string, string> } | ({ ok: true } & R)> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: { file: "Elige un archivo .xlsx" } };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, errors: { file: "El archivo no puede pasar de 2 MB" } };
  let result: R | undefined;
  const r = await toActionResult(async () => { result = await run(new Uint8Array(await file.arrayBuffer()), {
    apply: form.get("apply") === "1", mode: form.get("mode") === "full" ? "full" : "merge", keep: form.getAll("keep").map(String),
  }); });
  if (!r.ok) return r;
  if (result!.applied) revalidatePath(path);
  return { ok: true, ...result! };
}
