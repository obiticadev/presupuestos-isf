import { prisma } from "@/lib/db";
import { todayMadrid } from "@/lib/dates";
import { formatDecimalEs } from "@/lib/decimal";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { Prisma, type Quote, type QuoteStatus } from "@/generated/prisma/client";
import { logAction, type AuditEntry } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import { STATUS_LABEL } from "./labels";
import { logQuote, quoteLabel, recalc, withDraft, type Tx } from "./service";

export const QUOTES_PAGE_SIZE = 50;
type SettableStatus = Exclude<QuoteStatus, "DRAFT">;

/** Manual status change of an issued quote (spec 5.5); a superseded revision no longer changes. */
export async function setStatus(actor: CurrentUser, id: string, status: SettableStatus): Promise<void> {
  if (!Object.hasOwn(STATUS_LABEL, status) || (status as string) === "DRAFT") throw new ValidationError({ status: "Estado no válido" });
  await prisma.$transaction(async (tx) => {
    // Locked like issueQuote, so issuing the next revision cannot slip in between the supersede check and the update.
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${id} FOR UPDATE`;
    const q = await tx.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundError("El presupuesto no existe");
    if (q.status === "DRAFT") throw new ValidationError({ _: "Un borrador se emite; su estado no se cambia a mano" });
    if (q.supersededById) throw new ValidationError({ _: "Sustituido por una revisión posterior: ya no cambia de estado" });
    if (q.status === status) return;
    await tx.quote.update({ where: { id }, data: { status } });
    await logQuote(tx, actor, id, "status", `Estado de ${quoteLabel(q)}: ${STATUS_LABEL[q.status]} → ${STATUS_LABEL[status]}`);
  });
}

/**
 * Issued or sent quotes whose validity ran out become «Caducado», counting Madrid days: issued on the 1st with 30 days,
 * still valid on the 31st, expired from the 32nd. Idempotent; run on start and every hour (instrumentation.ts).
 */
export async function expireQuotes(now = new Date()): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; reference: string; status: QuoteStatus }[]>`
      WITH due AS (
        SELECT id, reference, status FROM "Quote"
        WHERE status IN ('ISSUED', 'SENT') AND "supersededById" IS NULL
          AND ("issuedAt" AT TIME ZONE 'Europe/Madrid')::date + "validityDays" < (${now}::timestamptz AT TIME ZONE 'Europe/Madrid')::date
        FOR UPDATE)
      UPDATE "Quote" q SET status = 'EXPIRED', "updatedAt" = now() FROM due WHERE q.id = due.id
      RETURNING due.id, due.reference, due.status`;
    for (const r of rows)
      await logAction(tx, { userId: null, entity: "quote", entityId: r.id, action: "status", summary: `Estado de ${r.reference}: ${STATUS_LABEL[r.status]} → ${STATUS_LABEL.EXPIRED} (validez vencida)` });
    return rows.length;
  });
}

/** Deep copy of sections, lines (with adjustments) and kit instances into another quote. */
async function copyContent(tx: Tx, fromId: string, toId: string): Promise<void> {
  const sections = await tx.quoteSection.findMany({
    where: { quoteId: fromId, parentId: null }, orderBy: { position: "asc" },
    include: { children: { orderBy: { position: "asc" }, include: { kits: true, lines: { include: { adjustments: true } } } } },
  });
  for (const s of sections) {
    const { id: _s, quoteId: _q, parentId: _p, children, ...sectionData } = s;
    const ns = await tx.quoteSection.create({ data: { ...sectionData, quoteId: toId } });
    for (const sub of children) {
      const { id: _i, quoteId: _qq, parentId: _pp, kits, lines, ...subData } = sub;
      const nsub = await tx.quoteSection.create({ data: { ...subData, quoteId: toId, parentId: ns.id } });
      const kitMap = new Map<string, string>();
      for (const k of kits) {
        const { id: kid, sectionId: _sid, ...kitData } = k;
        const nk = await tx.kitInstance.create({
          data: { ...kitData, sectionId: nsub.id, definition: kitData.definition as Prisma.InputJsonValue, params: kitData.params as Prisma.InputJsonValue, choices: kitData.choices as Prisma.InputJsonValue, missing: kitData.missing as Prisma.InputJsonValue },
        });
        kitMap.set(kid, nk.id);
      }
      for (const l of lines) {
        const { id: _l, sectionId: _ls, adjustments, kitInstanceId, ...lineData } = l;
        await tx.quoteLine.create({
          data: {
            ...lineData, sectionId: nsub.id, kitInstanceId: kitInstanceId ? kitMap.get(kitInstanceId) : null,
            adjustments: { create: adjustments.map(({ id: _a, lineId: _al, ...a }) => a) },
          },
        });
      }
    }
  }
}

const HEADER = (q: Quote) => ({
  clientId: q.clientId, locationId: q.locationId, contactId: q.contactId, subject: q.subject, paymentTerms: q.paymentTerms,
  exclusions: q.exclusions, validityDays: q.validityDays, waivers: q.waivers as Prisma.InputJsonValue,
  base: q.base, total: q.total,
});

/** New draft revision (R+1) of an issued quote that has not been superseded yet; the previous one stays intact. */
export async function createRevision(actor: CurrentUser, id: string): Promise<Quote & { refreshed: number }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const q = await tx.quote.findUnique({ where: { id } });
      if (!q) throw new NotFoundError("El presupuesto no existe");
      if (q.status === "DRAFT") throw new ValidationError({ _: "Solo se revisa un presupuesto emitido" });
      if (q.supersededById) throw new ValidationError({ _: "Sustituido por una revisión posterior: revisa la última" });
      const rev = await tx.quote.create({
        data: { ...HEADER(q), seqYear: q.seqYear, seq: q.seq, revision: q.revision + 1, parentId: q.id, ownerId: actor.id, createdById: actor.id, date: todayMadrid() },
      });
      await copyContent(tx, q.id, rev.id);
      const refreshed = await refreshLines(tx, rev.id); // a revision starts from today's catalog prices
      await logQuote(tx, actor, q.id, "revision", `Borrador de revisión R${String(rev.revision).padStart(2, "0")} de ${q.reference}`);
      await logQuote(tx, actor, rev.id, "revision", `Revisión de ${q.reference}${refreshed ? `; ${refreshed} línea${refreshed === 1 ? "" : "s"} con precios del catálogo` : ""}`);
      if (refreshed) await recalc(tx, rev.id, actor.id);
      return { ...(await tx.quote.findUniqueOrThrow({ where: { id: rev.id } })), refreshed };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const q = await prisma.quote.findUniqueOrThrow({ where: { id } });
      throw new ValidationError({ _: `Ya hay un borrador de revisión R${String(q.revision + 1).padStart(2, "0")} de este presupuesto` });
    }
    throw e;
  }
}

/** Copy as a new unnumbered draft with the same prices; warns about lines whose catalog concept changed. */
export async function duplicateQuote(actor: CurrentUser, id: string): Promise<{ quote: Quote; warnings: string[] }> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundError("El presupuesto no existe");
    const copy = await tx.quote.create({ data: { ...HEADER(q), ownerId: actor.id, createdById: actor.id, date: todayMadrid() } });
    await copyContent(tx, q.id, copy.id);
    await logQuote(tx, actor, copy.id, "duplicate", `Duplicado de ${quoteLabel(q)}`);
    return { quote: copy, warnings: await priceWarnings(tx, copy.id) };
  });
}

async function catalogLines(tx: Tx, quoteId: string) {
  return tx.quoteLine.findMany({
    where: { section: { quoteId }, conceptId: { not: null }, unitPrice: { not: null } },
    include: { concept: { include: { unit: true, tax: true } }, adjustments: true, section: true },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
  });
}

export async function priceWarnings(tx: Tx | typeof prisma, quoteId: string): Promise<string[]> {
  const out: string[] = [];
  for (const l of await catalogLines(tx as Tx, quoteId)) {
    const c = l.concept!;
    if (!c.active) out.push(`${c.code}: desactivado en el catálogo`);
    else if (c.salePrice && l.unitPrice && !c.salePrice.equals(l.unitPrice) && !l.adjustments.length)
      out.push(`${c.code}: catálogo ${formatDecimalEs(c.salePrice, { max: 4 })}, presupuesto ${formatDecimalEs(l.unitPrice, { max: 4 })}`);
  }
  return [...new Set(out)];
}

/** Draft only: re-copies price, description, unit and tax from active catalog concepts, leaving adjusted lines alone. */
export async function refreshPricesFromCatalog(actor: CurrentUser, id: string): Promise<number> {
  return withDraft(actor, id, async (tx) => {
    const n = await refreshLines(tx, id);
    await logQuote(tx, actor, id, "update", `Precios actualizados desde el catálogo: ${n} línea${n === 1 ? "" : "s"}`);
    return n;
  });
}

/** Re-copies price, description, unit and tax from active catalog concepts into a quote's lines, leaving adjusted and global-price lines alone. */
async function refreshLines(tx: Tx, quoteId: string): Promise<number> {
  let n = 0;
  for (const l of await catalogLines(tx, quoteId)) {
    const c = l.concept!;
    if (!c.active || !c.salePrice || l.adjustments.length || l.section.mode === "GLOBAL") continue;
    if (c.salePrice.equals(l.unitPrice!) && c.description === l.description && c.unit.name === l.unitName
      && c.tax.name === l.taxName && c.tax.ratePct.equals(l.taxRatePct ?? -1)) continue;
    await tx.quoteLine.update({ where: { id: l.id }, data: { unitPrice: c.salePrice, description: c.description, unitName: c.unit.name, taxName: c.tax.name, taxRatePct: c.tax.ratePct } });
    n++;
  }
  return n;
}

export type QuoteFilter = { q?: string; clientId?: string; ownerId?: string; status?: QuoteStatus | "all"; from?: string; to?: string; page?: number };

/** Latest issued revision of each number plus every draft (superseded ones are left out), with the filtered sum. */
export async function listQuotes(filter: QuoteFilter) {
  const term = filter.q?.trim();
  const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : undefined);
  const base: Prisma.QuoteWhereInput = {
    supersededById: null,
    ...(filter.clientId && { clientId: filter.clientId }),
    ...(filter.ownerId && { ownerId: filter.ownerId }),
    ...((date(filter.from) || date(filter.to)) && { date: { gte: date(filter.from), lte: date(filter.to) } }),
    ...(term && { OR: [
      { reference: { contains: term, mode: "insensitive" } },
      { subject: { contains: term, mode: "insensitive" } },
      { client: { legalName: { contains: term, mode: "insensitive" } } },
    ] }),
  };
  const where: Prisma.QuoteWhereInput = { ...base, ...(filter.status && filter.status !== "all" && { status: filter.status }) };
  const page = Math.max(1, filter.page ?? 1);
  const [items, total, agg, groups] = await Promise.all([
    prisma.quote.findMany({
      where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * QUOTES_PAGE_SIZE, take: QUOTES_PAGE_SIZE,
      include: { client: { select: { legalName: true } }, owner: { select: { name: true } }, parent: { select: { revision: true } } },
    }),
    prisma.quote.count({ where }),
    prisma.quote.aggregate({ where, _sum: { total: true } }),
    prisma.quote.groupBy({ by: ["status"], where: base, _count: true }),
  ]);
  const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map((s) => [s, 0])) as Record<QuoteStatus, number>;
  for (const g of groups) counts[g.status] = g._count;
  return { items, total, sum: agg._sum.total ?? new Prisma.Decimal(0), counts };
}
export type QuoteRow = Awaited<ReturnType<typeof listQuotes>>["items"][number];

/** Every revision of the quote's number, newest first; empty while it has no number. */
export async function listRevisions(id: string) {
  const q = await prisma.quote.findUnique({ where: { id }, select: { seqYear: true, seq: true } });
  if (!q || q.seq === null) return [];
  return prisma.quote.findMany({
    where: { seqYear: q.seqYear, seq: q.seq }, orderBy: { revision: "desc" },
    select: { id: true, revision: true, status: true, reference: true, issuedAt: true, owner: { select: { name: true } } },
  });
}

/** History of a quote and all its revisions, for any user (spec 5.9). */
export async function listQuoteHistory(id: string): Promise<AuditEntry[]> {
  const q = await prisma.quote.findUnique({ where: { id } });
  if (!q) throw new NotFoundError("El presupuesto no existe");
  const ids = q.seq !== null ? (await prisma.quote.findMany({ where: { seqYear: q.seqYear, seq: q.seq }, select: { id: true } })).map((x) => x.id) : [id];
  const rows = await prisma.auditLog.findMany({
    where: { entity: "quote", entityId: { in: ids } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
    include: { user: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, userName: r.user?.name ?? null, entity: r.entity, entityId: r.entityId, action: r.action, summary: r.summary }));
}
