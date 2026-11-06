import { getCurrentUser } from "@/modules/auth/session";
import { writeCatalogSheet, XLSX_TYPE } from "@/modules/catalog/excel";

export const dynamic = "force-dynamic";

/** Empty workbook with the import columns and the instructions sheet. */
export async function GET(): Promise<Response> {
  if (!(await getCurrentUser())) return new Response("No autorizado", { status: 401 });
  return new Response(await writeCatalogSheet([]), {
    headers: { "content-type": XLSX_TYPE, "content-disposition": 'attachment; filename="plantilla-catalogo.xlsx"' },
  });
}
