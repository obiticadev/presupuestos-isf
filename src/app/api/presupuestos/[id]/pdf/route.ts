import { getCurrentUser } from "@/modules/auth/session";
import { pdfResponse } from "@/modules/quotes/pdf";

export const dynamic = "force-dynamic";

/** PDF of an issued quote (frozen) or a watermarked preview of a draft. Any signed-in user. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return pdfResponse(await getCurrentUser(), (await params).id);
}
