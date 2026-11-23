import { getCurrentUser } from "@/modules/auth/session";
import { XLSX_TYPE } from "@/modules/catalog/excel";
import { writeClientsBook } from "@/modules/clients/excel";
import { exportClients } from "@/modules/clients/service";

export const dynamic = "force-dynamic";

/** Every client, active and inactive, with contacts and installations, in the import format. Any signed-in user. */
export async function GET(): Promise<Response> {
  if (!(await getCurrentUser())) return new Response("No autorizado", { status: 401 });
  const bytes = await writeClientsBook(await exportClients());
  const day = new Date().toISOString().slice(0, 10);
  return new Response(bytes, {
    headers: { "content-type": XLSX_TYPE, "content-disposition": `attachment; filename="clientes-${day}.xlsx"` },
  });
}
