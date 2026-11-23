import { getCurrentUser } from "@/modules/auth/session";
import { XLSX_TYPE } from "@/modules/catalog/excel";
import { writeClientsBook } from "@/modules/clients/excel";

export const dynamic = "force-dynamic";

/** Empty workbook with the three import sheets and the instructions. */
export async function GET(): Promise<Response> {
  if (!(await getCurrentUser())) return new Response("No autorizado", { status: 401 });
  return new Response(await writeClientsBook([]), {
    headers: { "content-type": XLSX_TYPE, "content-disposition": 'attachment; filename="plantilla-clientes.xlsx"' },
  });
}
