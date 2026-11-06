import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/modules/auth/session";
import { dataDir, getSettings } from "@/modules/settings/service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await getCurrentUser())) return new Response("No autorizado", { status: 401 });
  const { logoPath } = await getSettings();
  if (!logoPath) return new Response("Sin logo", { status: 404 });
  try {
    const bytes = await readFile(path.join(dataDir(), logoPath));
    const type = logoPath.endsWith(".png") ? "image/png" : "image/jpeg";
    return new Response(bytes, { headers: { "content-type": type, "cache-control": "private, no-cache" } });
  } catch {
    return new Response("Sin logo", { status: 404 });
  }
}
