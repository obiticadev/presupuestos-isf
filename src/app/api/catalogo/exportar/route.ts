import { getCurrentUser } from "@/modules/auth/session";
import { writeCatalogSheet, XLSX_TYPE } from "@/modules/catalog/excel";
import { exportConcepts } from "@/modules/catalog/service";

export const dynamic = "force-dynamic";

/** The whole catalog, active and inactive, in the import format. Any signed-in user. */
export async function GET(): Promise<Response> {
  if (!(await getCurrentUser())) return new Response("No autorizado", { status: 401 });
  const bytes = await writeCatalogSheet(await exportConcepts());
  const day = new Date().toISOString().slice(0, 10);
  return new Response(bytes, {
    headers: { "content-type": XLSX_TYPE, "content-disposition": `attachment; filename="catalogo-${day}.xlsx"` },
  });
}
