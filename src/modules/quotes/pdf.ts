import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { buildDocument, toPdfSource, type PdfSource } from "@/pdf/document";
import { renderDocument } from "@/pdf/templates";
import { getSignature } from "@/modules/account/service";
import { logAction } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import { dataDir, getSettings, readLogo } from "@/modules/settings/service";
import { TEMPLATE_VERSION } from "./issue";
import { getQuote } from "./service";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const safe = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

export function pdfFileName(q: { reference: string | null; client: { legalName: string } }): string {
  return `${q.reference ? safe(q.reference) : `BORRADOR-${safe(q.client.legalName)}`}.pdf`;
}

/**
 * The issued quote's PDF, generated once from its frozen snapshot and kept under DATA_DIR with its hash.
 * A missing or altered file is regenerated; the row lock queues concurrent calls for the same quote.
 */
export function ensureIssuedPdf(actor: CurrentUser | null, quoteId: string): Promise<{ path: string; sha256: string; bytes: Uint8Array }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "IssuedDocument" WHERE "quoteId" = ${quoteId} FOR UPDATE`;
    const doc = await tx.issuedDocument.findUnique({ where: { quoteId }, include: { quote: { select: { seqYear: true } } } });
    if (!doc) {
      if (!(await tx.quote.findUnique({ where: { id: quoteId }, select: { id: true } }))) throw new NotFoundError("El presupuesto no existe");
      throw new ValidationError({ _: "Un borrador no tiene PDF emitido" });
    }
    let reason = "faltaba el archivo";
    if (doc.pdfPath && doc.sha256) {
      const bytes = await readFile(path.join(dataDir(), doc.pdfPath)).catch(() => null);
      if (bytes && sha256(bytes) === doc.sha256) return { path: doc.pdfPath, sha256: doc.sha256, bytes };
      if (bytes) reason = "el archivo no coincidía";
    }

    const source = doc.snapshot as PdfSource;
    const bytes = await renderDocument(doc.templateVersion, buildDocument(source, { draft: false }), await readLogo(source.company.logoPath));
    const rel = `pdf/${doc.quote.seqYear}/${pdfFileName(source.quote)}`;
    const file = path.join(dataDir(), rel);
    const tmp = `${file}.${randomUUID()}.tmp`; // rename is atomic: a reader never sees a half-written file
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(tmp, bytes);
    await rename(tmp, file);
    const hash = sha256(bytes);
    await tx.issuedDocument.update({ where: { id: doc.id }, data: { pdfPath: rel, sha256: hash } });
    if (doc.pdfPath)
      await logAction(tx, { userId: actor?.id ?? null, entity: "quote", entityId: quoteId, action: "pdf", summary: `PDF regenerado desde la instantánea: ${reason}` });
    return { path: rel, sha256: hash, bytes };
  }, { timeout: 60_000 });
}

export async function readIssuedPdf(actor: CurrentUser, quoteId: string): Promise<Uint8Array> {
  const { bytes } = await ensureIssuedPdf(actor, quoteId);
  const { reference } = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, select: { reference: true } });
  await logAction(prisma, { userId: actor.id, entity: "quote", entityId: quoteId, action: "download", summary: `Descarga de ${reference}` });
  return bytes;
}

/** Preview of a draft with the current company data and template, watermarked; nothing is stored. Signed by the viewer, who would issue it. */
export async function draftPdf(quoteId: string, viewer: CurrentUser): Promise<Uint8Array> {
  const [settings, quote, signature] = await Promise.all([getSettings(), getQuote(quoteId), getSignature(viewer.id)]);
  const signer = signature && { name: viewer.name, signature: Buffer.from(signature).toString("base64") };
  return renderDocument(TEMPLATE_VERSION, buildDocument({ ...toPdfSource(settings, quote), signer }, { draft: true }), await readLogo(settings.logoPath));
}

export async function pdfResponse(user: CurrentUser | null, quoteId: string): Promise<Response> {
  if (!user) return new Response("No autorizado", { status: 401 });
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { status: true, reference: true, client: { select: { legalName: true } } } });
  if (!q) return new Response("El presupuesto no existe", { status: 404 });
  try {
    const bytes = q.status === "DRAFT" ? await draftPdf(quoteId, user) : await readIssuedPdf(user, quoteId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${pdfFileName(q)}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    console.error(`pdf: no se pudo generar el PDF de ${quoteId}`, e);
    return new Response("No se pudo generar el PDF", { status: 500 });
  }
}
