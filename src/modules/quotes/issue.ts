import { prisma } from "@/lib/db";
import { todayMadrid } from "@/lib/dates";
import { ValidationError } from "@/lib/errors";
import { Prisma, type Concept, type Quote, type RequiredConcept } from "@/generated/prisma/client";
import { getSignature } from "@/modules/account/service";
import type { CurrentUser } from "@/modules/auth/session";
import { formatReference, nextNumber } from "./numbering";
import { LOCKED } from "./schema";
import { getQuote, logQuote, type QuoteDetail } from "./service";

export type IssueProblem = { code: string; message: string; anchor: string };
export const TEMPLATE_VERSION = "v1";

/**
 * Spec 5.6: everything a draft needs before it can be issued, each with the element to jump to.
 * `hasSignature`: whether whoever would issue it (the viewer) has a signature; the issuer signs the PDF.
 */
export function issueChecks(q: QuoteDetail, required: (RequiredConcept & { concept: Concept })[], hasSignature = true): IssueProblem[] {
  const out: IssueProblem[] = [];
  if (!hasSignature) out.push({ code: "signature", message: "Falta tu firma: configúrala en Mi cuenta", anchor: "/cuenta" });
  const subs = q.sections.flatMap((s) => s.children);
  const lines = subs.flatMap((s) => s.lines.map((l) => ({ ...l, mode: s.mode })));
  if (!q.locationId) out.push({ code: "location", message: "Falta la instalación", anchor: "#cabecera" });
  else if (!q.location?.active || q.location.clientId !== q.clientId)
    out.push({ code: "location", message: "La instalación ya no está activa en el cliente: elige otra", anchor: "#cabecera" });
  if (!q.subject.trim()) out.push({ code: "subject", message: "Falta el asunto", anchor: "#cabecera" }); // the letter reads «en referencia a {asunto}»
  if (!q.paymentTerms.trim()) out.push({ code: "paymentTerms", message: "Falta la forma de pago", anchor: "#cabecera" });
  const priced = lines.some((l) => l.mode === "SUM" && l.unitPrice !== null) || subs.some((s) => s.mode === "GLOBAL"); // an unpriced global one is reported below
  if (!priced) out.push({ code: "empty", message: "El presupuesto no tiene ninguna línea con precio", anchor: "#partidas" });
  for (const r of required.filter((x) => x.concept.active)) { // a deactivated concept can no longer be added, so it is not demanded
    const qty = lines.filter((l) => l.conceptId === r.conceptId).some((l) => l.quantity.gt(0));
    if (!qty && !q.waivers[r.conceptId])
      out.push({ code: "required", message: `Falta ${r.concept.description} (o márcalo a 0 con motivo)`, anchor: "#obligatorios" });
  }
  for (const k of subs.flatMap((s) => s.kits)) {
    const missing = k.missing as string[];
    if (missing.length) out.push({ code: "kit", message: `Conjunto ${k.name}: ${missing.join(", ")}`, anchor: `#conjunto-${k.id}` });
  }
  const unvalidated = lines.filter((l) => l.mode === "SUM" && l.unitPrice !== null && l.concept && !l.concept.validated);
  if (unvalidated.length) {
    const codes = [...new Set(unvalidated.map((l) => l.concept!.code))];
    out.push({ code: "unvalidated", message: `${codes.length} concepto${codes.length > 1 ? "s" : ""} sin validar: ${codes.join(", ")}`, anchor: `#linea-${unvalidated[0].id}` });
  }
  for (const id of q.totals.unpricedLineIds) {
    out.push({ code: "unpriced", message: `Línea sin precio o sin impuesto: ${lines.find((l) => l.id === id)?.description}`, anchor: `#linea-${id}` });
  }
  for (const s of subs.filter((x) => x.mode === "GLOBAL" && (x.globalQty === null || x.globalPrice === null || x.taxName === null))) {
    out.push({ code: "global", message: `Subpartida ${s.title || "sin nombre"}: falta cantidad, precio o impuesto`, anchor: `#seccion-${s.id}` });
  }
  return out;
}

/** Issues a draft: checks, number, reference, supersedes the previous revision and stores the frozen snapshot. */
export async function issueQuote(actor: CurrentUser, id: string): Promise<Quote> {
  try {
    return await issueInTx(actor, id);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new ValidationError({ _: "Ese número de presupuesto ya existe: revisa la numeración en Configuración" });
    throw e;
  }
}

function issueInTx(actor: CurrentUser, id: string): Promise<Quote> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${id} FOR UPDATE`;
    const q = await getQuote(id, tx);
    if (q.status !== "DRAFT") throw new ValidationError({ _: LOCKED });
    const required = await tx.requiredConcept.findMany({ include: { concept: true }, orderBy: { concept: { code: "asc" } } });
    const signature = await getSignature(actor.id, tx);
    const problems = issueChecks(q, required, signature !== null);
    if (problems.length) throw new ValidationError({ _: `No se puede emitir: ${problems.map((p) => p.message).join(" · ")}` });

    const settings = await tx.companySettings.findUniqueOrThrow({ where: { id: 1 } });
    const now = new Date();
    const seqYear = q.seqYear ?? todayMadrid(now).getUTCFullYear();
    const seq = q.seq ?? (await nextNumber(tx, seqYear, settings));
    const reference = formatReference(settings.numberPattern, { year: seqYear, seq, revision: q.revision });
    if (q.parentId) {
      const parent = await tx.quote.findUniqueOrThrow({ where: { id: q.parentId } });
      if (parent.supersededById) throw new ValidationError({ _: "La revisión anterior ya está sustituida por otra" });
      await tx.quote.update({ where: { id: parent.id }, data: { supersededById: id } });
    }
    const issued = await tx.quote.update({ where: { id }, data: { status: "ISSUED", issuedAt: now, seqYear, seq, reference, ownerId: actor.id } }); // the issuer is the responsible
    // JSON round-trip: Decimals become strings and Dates ISO strings; the snapshot never changes afterwards.
    const { id: _id, updatedAt: _updated, ...company } = settings;
    const signer = { name: actor.name, signature: Buffer.from(signature!).toString("base64") }; // frozen: a later change of signature does not reach it
    const snapshot = JSON.parse(JSON.stringify({ company, quote: { ...q, ...issued }, signer })) as Prisma.InputJsonValue;
    await tx.issuedDocument.create({ data: { quoteId: id, snapshot, templateVersion: TEMPLATE_VERSION } });
    await logQuote(tx, actor, id, "issue", `Emisión de ${reference}`);
    return issued;
  });
}
