import { createHash } from "node:crypto";
import { appendFile, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { prisma } from "@/lib/db";
import { todayMadrid } from "@/lib/dates";
import { closeBrowser } from "@/pdf/browser";
import { renderDocument } from "@/pdf/templates";
import { getConcept, updateConcept } from "@/modules/catalog/service";
import { issueQuote } from "@/modules/quotes/issue";
import { ensureIssuedPdf, pdfFileName, pdfResponse, readIssuedPdf } from "@/modules/quotes/pdf";
import { updateSettings } from "@/modules/settings/service";
import { completeDraft, conceptFields, makeDraft } from "../helpers/quotes";

// Counts renders so a test can tell a regeneration from a file served as it was.
vi.mock("@/pdf/templates", async (orig) => {
  const m = await orig<typeof import("@/pdf/templates")>();
  return { ...m, renderDocument: vi.fn(m.renderDocument) };
});

vi.setConfig({ testTimeout: 60_000 });
afterAll(closeBrowser);

const year = todayMadrid().getUTCFullYear();
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const text = async (pdf: Uint8Array) => norm((await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true })).text);
const abs = (p: string) => path.join(process.env.DATA_DIR!, p);
const pdfLog = (quoteId: string, action: string) =>
  prisma.auditLog.findMany({ where: { entity: "quote", entityId: quoteId, action }, select: { summary: true, userId: true } });

async function issued() {
  const d = await completeDraft();
  await issueQuote(d.actor, d.quote.id);
  return d;
}

beforeEach(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "isf-data-"));
  vi.mocked(renderDocument).mockClear();
});

test("el PDF del emitido se genera una vez, con su hash, y la segunda llamada no lo reescribe", async () => {
  const { actor, quote } = await issued();
  const r = await ensureIssuedPdf(actor, quote.id);
  expect(r.path).toBe(`pdf/${year}/PR-${year}000001-R00.pdf`);
  const file = await readFile(abs(r.path));
  const doc = await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: quote.id } });
  expect([doc.pdfPath, doc.sha256]).toEqual([r.path, sha(file)]);
  const before = (await stat(abs(r.path))).mtimeMs;
  const again = await ensureIssuedPdf(actor, quote.id);
  expect(again.sha256).toBe(r.sha256);
  expect((await stat(abs(r.path))).mtimeMs).toBe(before);
  expect(renderDocument).toHaveBeenCalledTimes(1);
  expect(await pdfLog(quote.id, "pdf")).toEqual([]);
});

test("si falta el archivo se regenera desde la instantánea y queda en el historial", async () => {
  const { actor, quote } = await issued();
  const first = await ensureIssuedPdf(actor, quote.id);
  const lines = (await prisma.quoteLine.findMany({ where: { section: { quoteId: quote.id } } })).map((l) => l.description);
  await rm(abs(first.path));
  const r = await ensureIssuedPdf(null, quote.id);
  const t = await text(await readFile(abs(r.path)));
  for (const l of lines) expect(t).toContain(norm(l));
  expect(await pdfLog(quote.id, "pdf")).toEqual([{ summary: "PDF regenerado desde la instantánea: faltaba el archivo", userId: null }]);
});

test("dos llamadas a la vez sin archivo se ponen en cola: una sola escritura", async () => {
  const { actor, quote } = await issued();
  const [a, b] = await Promise.all([ensureIssuedPdf(actor, quote.id), ensureIssuedPdf(actor, quote.id)]);
  expect(renderDocument).toHaveBeenCalledTimes(1);
  expect(a.sha256).toBe(b.sha256);
  const doc = await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: quote.id } });
  expect(doc.sha256).toBe(sha(await readFile(abs(a.path))));
  expect(await readdir(path.dirname(abs(a.path)))).toEqual([path.basename(a.path)]); // no temporary left behind
});

test("regenerado tras cambiar el catálogo y la empresa, el PDF conserva los datos de la instantánea", async () => {
  const d = await completeDraft();
  await updateSettings(d.admin, { legalName: "Ingeniería Original S.L." });
  await issueQuote(d.actor, d.quote.id);
  const c = await getConcept("concept-ser-prog");
  await updateConcept(d.admin, c.id, { ...conceptFields(c), salePrice: "999" });
  await updateSettings(d.admin, { legalName: "Otra Empresa S.A." });
  await rm(abs((await ensureIssuedPdf(d.actor, d.quote.id)).path));
  const t = await text((await ensureIssuedPdf(d.actor, d.quote.id)).bytes);
  expect(t).toContain(norm("Ingeniería Original S.L."));
  expect(t).toContain(norm("1.246,30 €"));
  expect(t).not.toContain(norm("Otra Empresa"));
});

test("descargar registra la descarga en el historial", async () => {
  const { actor, quote } = await issued();
  await readIssuedPdf(actor, quote.id);
  expect(await pdfLog(quote.id, "download")).toEqual([{ summary: `Descarga de PR-${year}000001-R00`, userId: actor.id }]);
});

test("un archivo alterado se regenera al descargar", async () => {
  const { actor, quote } = await issued();
  const first = await ensureIssuedPdf(actor, quote.id);
  await appendFile(abs(first.path), "x");
  const bytes = await readIssuedPdf(actor, quote.id);
  expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  const doc = await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: quote.id } });
  expect(doc.sha256).toBe(sha(await readFile(abs(first.path))));
  expect(doc.sha256).toBe(sha(bytes));
  expect(await pdfLog(quote.id, "pdf")).toEqual([{ summary: "PDF regenerado desde la instantánea: el archivo no coincidía", userId: actor.id }]);
});

test("un borrador no tiene PDF emitido", async () => {
  const { actor, quote } = await makeDraft();
  await expect(ensureIssuedPdf(actor, quote.id)).rejects.toThrow("Un borrador no tiene PDF emitido");
});

test("pdfResponse: 401 sin usuario y 404 si no existe", async () => {
  const { actor, quote } = await makeDraft();
  expect((await pdfResponse(null, quote.id)).status).toBe(401);
  expect((await pdfResponse(actor, "no-existe")).status).toBe(404);
});

test("pdfResponse del emitido: su nombre, inline y sin caché", async () => {
  const { actor, quote } = await issued();
  const res = await pdfResponse(actor, quote.id);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toBe(`inline; filename="PR-${year}000001-R00.pdf"`);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
});

test("pdfResponse del borrador: vista previa con BORRADOR y sin guardar nada", async () => {
  const { actor, quote } = await completeDraft();
  const res = await pdfResponse(actor, quote.id);
  expect([res.status, res.headers.get("content-type")]).toEqual([200, "application/pdf"]);
  expect(await text(new Uint8Array(await res.arrayBuffer()))).toContain(norm("BORRADOR"));
  await expect(readdir(abs("pdf"))).rejects.toThrow();
  expect(await prisma.issuedDocument.count()).toBe(0);
});

test("pdfResponse devuelve 500 si falla la generación", async () => {
  const { actor, quote } = await completeDraft();
  vi.mocked(renderDocument).mockRejectedValueOnce(new Error("Chromium caído"));
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await pdfResponse(actor, quote.id);
  expect([res.status, await res.text()]).toEqual([500, "No se pudo generar el PDF"]);
  err.mockRestore();
});

test("pdfFileName", async () => {
  expect(pdfFileName({ reference: "PR-2026000002-R00", client: { legalName: "x" } })).toBe("PR-2026000002-R00.pdf");
  expect(pdfFileName({ reference: null, client: { legalName: "Conservas Ribera, S.A." } })).toBe("BORRADOR-Conservas-Ribera-S-A.pdf");
});
