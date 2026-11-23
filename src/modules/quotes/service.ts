import { prisma } from "@/lib/db";
import { todayMadrid } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { formatDecimalEs } from "@/lib/decimal";
import { parseOrThrow } from "@/lib/validation";
import type { Prisma, Quote, QuoteLine, QuoteSection, RequiredConcept, Concept } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";
import { getSettings } from "@/modules/settings/service";
import { calculateQuote, type CalcSection, type QuoteTotals } from "./calculation";
import { formatReference } from "./numbering";
import {
  catalogLineInput, commentInput, customLineInput, headerInput, lineUpdateInput, LOCKED, priceAdjustInput, sectionInput,
  type CatalogLineInput, type CommentInput, type CustomLineInput, type HeaderInput, type LineUpdateInput, type PriceAdjustInput, type SectionInput,
} from "./schema";

// Spec 5.1: every signed-in user edits every quote, so these functions take the actor for the history only.
// Every content change runs through withDraft: row lock, DRAFT check, change, totals recalculated, all in one transaction.

export type Tx = Prisma.TransactionClient;

const LINE_INCLUDE = {
  concept: { select: { code: true, active: true, validated: true, salePrice: true } },
  adjustments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.QuoteLineInclude;
const SUB_INCLUDE = {
  // Loose lines first, then each kit's lines, as the editor shows them (PostgreSQL would put the nulls last).
  lines: { orderBy: [{ kitInstanceId: { sort: "asc", nulls: "first" } }, { position: "asc" }], include: LINE_INCLUDE },
  kits: { orderBy: { position: "asc" } },
} satisfies Prisma.QuoteSectionInclude;
const DETAIL = {
  client: true, location: true, contact: true, type: true, owner: { select: { id: true, name: true } },
  parent: { select: { id: true, revision: true } },
  issued: { select: { pdfPath: true } }, // no path yet: the PDF failed at issue and is made on download
  revisions: { select: { id: true, revision: true, status: true } },
  sections: {
    where: { parentId: null }, orderBy: { position: "asc" },
    include: { children: { orderBy: { position: "asc" }, include: SUB_INCLUDE } },
  },
} satisfies Prisma.QuoteInclude;
type DetailRow = Prisma.QuoteGetPayload<{ include: typeof DETAIL }>;
export type QuoteDetail = Omit<DetailRow, "waivers"> & { waivers: Record<string, string>; totals: QuoteTotals };
export type KitInstanceDetail = DetailRow["sections"][number]["children"][number]["kits"][number];
export type SectionDetail = DetailRow["sections"][number];
export type SubsectionDetail = SectionDetail["children"][number];
export type LineDetail = SubsectionDetail["lines"][number];

type CalcShape = {
  id: string;
  children: (Pick<QuoteSection, "id" | "mode" | "globalQty" | "globalPrice" | "taxName" | "taxRatePct"> & {
    lines: Pick<QuoteLine, "id" | "quantity" | "unitPrice" | "taxName" | "taxRatePct">[];
  })[];
};

/** Quote sections → calculation input. Decimals go over as strings so client and browser Decimal types never mix. */
export function toCalc(sections: CalcShape[]): CalcSection[] {
  const s = (d: { toString(): string } | null) => (d === null ? null : d.toString());
  return sections.map((sec) => ({
    id: sec.id,
    subsections: sec.children.map((sub) => ({
      id: sub.id, mode: sub.mode, globalQty: s(sub.globalQty), globalPrice: s(sub.globalPrice),
      taxName: sub.taxName, taxRatePct: s(sub.taxRatePct),
      lines: sub.lines.map((l) => ({ id: l.id, quantity: l.quantity.toString(), unitPrice: s(l.unitPrice), taxName: l.taxName, taxRatePct: s(l.taxRatePct) })),
    })),
  }));
}

export async function recalc(tx: Tx, quoteId: string, ownerId: string): Promise<void> {
  const sections = await tx.quoteSection.findMany({ where: { quoteId, parentId: null }, include: { children: { include: { lines: true } } } });
  const t = calculateQuote(toCalc(sections));
  await tx.quote.update({ where: { id: quoteId }, data: { base: t.base.toFixed(2), total: t.total.toFixed(2), ownerId } });
}

/**
 * Locks the quote row, refuses anything but a draft, runs `fn` and stores the new totals, in one transaction.
 * Whoever changes the draft becomes its responsible; `actor` null (internal notes) leaves the quote row as it was.
 */
export async function withDraft<T>(actor: CurrentUser | null, quoteId: string, fn: (tx: Tx, quote: Quote) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${quoteId} FOR UPDATE`;
    const quote = await tx.quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundError("El presupuesto no existe");
    if (quote.status !== "DRAFT") throw new ValidationError({ _: LOCKED });
    const result = await fn(tx, quote);
    // Notes (null actor) change neither totals nor the quote: leave its row, and its updatedAt, untouched.
    if (actor) await recalc(tx, quoteId, actor.id);
    return result;
  });
}

/**
 * The issued reference; a numbered draft (revision or extension) is «Borrador-» + the reference it will get,
 * an unnumbered one «Borrador-{instalación}» (or «Borrador» until one is chosen).
 */
export function quoteLabel(
  q: Pick<Quote, "reference" | "revision" | "seq" | "extension" | "seqYear" | "typeCode" | "numberPattern"> & { location?: { name: string } | null },
): string {
  if (q.reference) return q.reference;
  if (q.seq !== null && q.numberPattern)
    return `Borrador-${formatReference(q.numberPattern, { year: q.seqYear!, typeCode: q.typeCode, seq: q.seq, extension: q.extension, revision: q.revision })}`;
  return q.location ? `Borrador-${q.location.name}` : "Borrador";
}

export async function logQuote(tx: Tx, actor: CurrentUser, quoteId: string, action: string, summary: string, data?: unknown) {
  await logAction(tx, { userId: actor.id, entity: "quote", entityId: quoteId, action, summary, data });
}

async function findSection(id: string): Promise<QuoteSection> {
  const s = await prisma.quoteSection.findUnique({ where: { id } });
  if (!s) throw new NotFoundError("La partida no existe");
  return s;
}

async function findSubsection(id: string): Promise<QuoteSection> {
  const s = await findSection(id);
  if (!s.parentId) throw new ValidationError({ _: "Las líneas van dentro de una subpartida" });
  return s;
}

async function findLine(id: string): Promise<QuoteLine & { section: QuoteSection }> {
  const l = await prisma.quoteLine.findUnique({ where: { id }, include: { section: true } });
  if (!l) throw new NotFoundError("La línea no existe");
  return l;
}

async function nextPosition(tx: Tx, where: { quoteId: string; parentId: string | null } | { sectionId: string }): Promise<number> {
  const max = "sectionId" in where
    ? (await tx.quoteLine.aggregate({ where, _max: { position: true } }))._max.position
    : (await tx.quoteSection.aggregate({ where, _max: { position: true } }))._max.position;
  return (max ?? 0) + 1;
}

/** A partida always comes with its first subpartida, so there is somewhere to add lines. */
export async function insertSection(tx: Tx, quoteId: string, parentId: string | null, title: string): Promise<QuoteSection> {
  const section = await tx.quoteSection.create({ data: { quoteId, parentId, title, position: await nextPosition(tx, { quoteId, parentId }) } });
  if (!parentId) await tx.quoteSection.create({ data: { quoteId, parentId: section.id, title: "", position: 1 } });
  return section;
}

async function activeTax(tx: Tx, taxId: string) {
  const tax = await tx.tax.findUnique({ where: { id: taxId } });
  if (!tax?.active) throw new ValidationError({ taxId: "Elige un impuesto activo" });
  return tax;
}

// ── Draft lifecycle ────────────────────────────────────────────────────────────

/** A client's quotes, newest first, for the client page. */
export async function listClientQuotes(clientId: string) {
  return prisma.quote.findMany({
    where: { clientId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, reference: true, seq: true, seqYear: true, typeCode: true, extension: true, numberPattern: true, revision: true, location: { select: { name: true } }, status: true, date: true, subject: true, total: true, supersededById: true },
  });
}

export async function createDraft(actor: CurrentUser, input: { clientId: string }): Promise<Quote> {
  const [client, settings] = await Promise.all([
    prisma.client.findUnique({
      where: { id: input.clientId },
      include: { locations: { where: { active: true } }, contacts: { where: { active: true } } },
    }),
    getSettings(),
  ]);
  if (!client) throw new NotFoundError("El cliente no existe");
  if (!client.active) throw new ValidationError({ clientId: "El cliente está desactivado" });
  const types = await prisma.quoteType.findMany({ where: { active: true }, select: { id: true }, take: 2 });
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.create({
      data: {
        clientId: client.id,
        typeId: types.length === 1 ? types[0].id : null,
        // A single active location or contact is the obvious choice; with several, the user picks.
        locationId: client.locations.length === 1 ? client.locations[0].id : null,
        contactId: client.contacts.length === 1 ? client.contacts[0].id : null,
        ownerId: actor.id, createdById: actor.id, date: todayMadrid(),
        paymentTerms: client.paymentTerms || settings.defaultPaymentTerms,
        exclusions: client.exclusions || settings.defaultExclusions,
        validityDays: client.offerValidityDays ?? settings.offerValidityDays,
      },
    });
    await insertSection(tx, quote.id, null, "");
    await logQuote(tx, actor, quote.id, "create", `Nuevo borrador para ${client.legalName}`);
    return quote;
  });
}

export async function deleteDraft(actor: CurrentUser, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${id} FOR UPDATE`;
    const quote = await tx.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundError("El presupuesto no existe");
    if (quote.status !== "DRAFT") throw new ValidationError({ _: LOCKED });
    await tx.quote.delete({ where: { id } });
    await logQuote(tx, actor, id, "delete", `${quoteLabel(quote)} eliminado`);
  });
}

export async function getQuote(id: string, db: Tx | typeof prisma = prisma): Promise<QuoteDetail> {
  const q = await db.quote.findUnique({ where: { id }, include: DETAIL });
  if (!q) throw new NotFoundError("El presupuesto no existe");
  return { ...q, waivers: (q.waivers ?? {}) as Record<string, string>, totals: calculateQuote(toCalc(q.sections)) };
}

export async function updateHeader(actor: CurrentUser, id: string, raw: HeaderInput): Promise<void> {
  const input = parseOrThrow(headerInput, raw);
  await withDraft(actor, id, async (tx, quote) => {
    const clientId = input.clientId ?? quote.clientId;
    const data: Prisma.QuoteUncheckedUpdateInput = { ...input };
    if (clientId !== quote.clientId) {
      const client = await tx.client.findUnique({ where: { id: clientId } });
      if (!client?.active) throw new ValidationError({ clientId: "Elige un cliente activo" });
      // The form also sends the previous client's location and contact: keep them only if they are the new client's.
      const [loc, contact] = await Promise.all([
        input.locationId ? tx.clientLocation.findUnique({ where: { id: input.locationId } }) : null,
        input.contactId ? tx.clientContact.findUnique({ where: { id: input.contactId } }) : null,
      ]);
      data.locationId = loc?.clientId === clientId && loc.active ? loc.id : null;
      data.contactId = contact?.clientId === clientId && contact.active ? contact.id : null;
    }
    const locationId = data.locationId as string | null | undefined;
    if (clientId === quote.clientId && locationId && locationId !== quote.locationId) {
      const loc = await tx.clientLocation.findUnique({ where: { id: locationId } });
      if (!loc || loc.clientId !== clientId || !loc.active) throw new ValidationError({ locationId: "Elige una instalación de este cliente" });
    }
    const contactId = data.contactId as string | null | undefined;
    if (clientId === quote.clientId && contactId && contactId !== quote.contactId) {
      const c = await tx.clientContact.findUnique({ where: { id: contactId } });
      if (!c || c.clientId !== clientId || !c.active) throw new ValidationError({ contactId: "Elige un contacto de este cliente" });
    }
    const changes = (k: "clientId" | "locationId" | "typeId") => input[k] !== undefined && input[k] !== quote[k];
    if (quote.extension > 0 && (changes("clientId") || changes("locationId") || changes("typeId")))
      throw new ValidationError({ _: "En una ampliación no se cambian tipo, cliente ni instalación" });
    if (input.typeId !== undefined && input.typeId !== quote.typeId) {
      if (quote.seq !== null) throw new ValidationError({ typeId: "El tipo solo se elige en el primer borrador" });
      const t = input.typeId ? await tx.quoteType.findUnique({ where: { id: input.typeId } }) : null;
      if (input.typeId && !t?.active) throw new ValidationError({ typeId: "Elige un tipo activo" });
    }
    if (input.ownerId && input.ownerId !== quote.ownerId) {
      const u = await tx.user.findUnique({ where: { id: input.ownerId } });
      if (!u || u.banned) throw new ValidationError({ ownerId: "Elige un usuario activo" });
    }
    await tx.quote.update({ where: { id }, data });
    await logQuote(tx, actor, id, "update", `Cabecera de ${quoteLabel(quote)} modificada`, input);
  });
}

// ── Sections ───────────────────────────────────────────────────────────────────

export async function addSection(actor: CurrentUser, quoteId: string, input: { parentId?: string; title: string }): Promise<QuoteSection> {
  const title = input.title.trim().slice(0, 300);
  return withDraft(actor, quoteId, async (tx) => {
    if (input.parentId) {
      const parent = await tx.quoteSection.findUnique({ where: { id: input.parentId } });
      if (!parent || parent.quoteId !== quoteId || parent.parentId) throw new ValidationError({ _: "La partida no existe" });
    }
    const s = await insertSection(tx, quoteId, input.parentId ?? null, title);
    await logQuote(tx, actor, quoteId, "update", `${input.parentId ? "Subpartida" : "Partida"} añadida${title ? `: ${title}` : ""}`);
    return s;
  });
}

export async function updateSection(actor: CurrentUser, sectionId: string, raw: SectionInput): Promise<void> {
  const input = parseOrThrow(sectionInput, raw);
  const section = await findSection(sectionId);
  await withDraft(actor, section.quoteId, async (tx) => {
    const data: Prisma.QuoteSectionUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (section.parentId) {
      if (input.mode) data.mode = input.mode;
      // A missing field means "unchanged"; an empty one clears it.
      if (raw.globalQty !== undefined) data.globalQty = input.globalQty;
      if (raw.globalPrice !== undefined) data.globalPrice = input.globalPrice;
      if (raw.taxId !== undefined) {
        const tax = input.taxId ? await activeTax(tx, input.taxId) : null;
        data.taxName = tax?.name ?? null;
        data.taxRatePct = tax?.ratePct ?? null;
      }
    } else if (input.mode || raw.globalQty !== undefined || raw.globalPrice !== undefined) {
      throw new ValidationError({ mode: "El precio global es de las subpartidas" });
    }
    await tx.quoteSection.update({ where: { id: sectionId }, data });
    await logQuote(tx, actor, section.quoteId, "update", `${section.parentId ? "Subpartida" : "Partida"} modificada${input.title ? `: ${input.title}` : ""}`);
  });
}

export async function moveSection(actor: CurrentUser, sectionId: string, dir: -1 | 1): Promise<void> {
  const section = await findSection(sectionId);
  await withDraft(actor, section.quoteId, async (tx) => {
    const siblings = await tx.quoteSection.findMany({ where: { quoteId: section.quoteId, parentId: section.parentId }, orderBy: { position: "asc" } });
    const i = siblings.findIndex((s) => s.id === sectionId);
    const other = siblings[i + dir];
    if (!other) return;
    await tx.quoteSection.update({ where: { id: sectionId }, data: { position: other.position } });
    await tx.quoteSection.update({ where: { id: other.id }, data: { position: siblings[i].position } });
  });
}

export async function removeSection(actor: CurrentUser, sectionId: string): Promise<void> {
  const section = await findSection(sectionId);
  await withDraft(actor, section.quoteId, async (tx) => {
    await tx.quoteSection.delete({ where: { id: sectionId } });
    await logQuote(tx, actor, section.quoteId, "update", `${section.parentId ? "Subpartida" : "Partida"} eliminada${section.title ? `: ${section.title}` : ""}`);
  });
}

// ── Lines ──────────────────────────────────────────────────────────────────────

/** Copies description, unit, price and tax from the catalog: later catalog changes leave the line alone. */
export async function addCatalogLine(actor: CurrentUser, subsectionId: string, raw: CatalogLineInput): Promise<QuoteLine> {
  const input = parseOrThrow(catalogLineInput, raw);
  const sub = await findSubsection(subsectionId);
  return withDraft(actor, sub.quoteId, async (tx) => {
    const c = await tx.concept.findUnique({ where: { id: input.conceptId }, include: { unit: true, tax: true } });
    if (!c) throw new NotFoundError("El concepto no existe");
    if (!c.active) throw new ValidationError({ conceptId: "El concepto está desactivado" });
    // In a global-price subsection lines only describe the work: no price, no tax.
    const descriptive = sub.mode === "GLOBAL";
    if (!descriptive && c.salePrice === null) throw new ValidationError({ conceptId: "Este concepto no tiene precio de venta" });
    const line = await tx.quoteLine.create({
      data: {
        sectionId: sub.id, position: await nextPosition(tx, { sectionId: sub.id }), conceptId: c.id,
        description: c.description, unitName: c.unit.name, quantity: input.quantity,
        unitPrice: descriptive ? null : c.salePrice, taxName: descriptive ? null : c.tax.name, taxRatePct: descriptive ? null : c.tax.ratePct,
      },
    });
    await logQuote(tx, actor, sub.quoteId, "update", `Línea añadida: ${c.code} × ${input.quantity.replace(".", ",")}`);
    return line;
  });
}

export async function addCustomLine(actor: CurrentUser, subsectionId: string, raw: CustomLineInput): Promise<QuoteLine> {
  const input = parseOrThrow(customLineInput, raw);
  const sub = await findSubsection(subsectionId);
  return withDraft(actor, sub.quoteId, async (tx) => {
    const descriptive = sub.mode === "GLOBAL";
    let tax: { name: string; ratePct: Prisma.Decimal } | null = null;
    if (!descriptive) {
      if (input.unitPrice === null) throw new ValidationError({ unitPrice: "Escribe el precio" });
      if (!input.taxId) throw new ValidationError({ taxId: "Elige un impuesto" });
      tax = await activeTax(tx, input.taxId);
    }
    const line = await tx.quoteLine.create({
      data: {
        sectionId: sub.id, position: await nextPosition(tx, { sectionId: sub.id }),
        description: input.description, unitName: input.unitName, quantity: input.quantity,
        unitPrice: descriptive ? null : input.unitPrice, taxName: tax?.name ?? null, taxRatePct: tax?.ratePct ?? null,
      },
    });
    await logQuote(tx, actor, sub.quoteId, "update", `Línea específica añadida: ${input.description}`);
    return line;
  });
}

const KIT_LINE = "Las líneas de un conjunto se cambian desde el conjunto";

export async function updateLine(actor: CurrentUser, lineId: string, raw: LineUpdateInput): Promise<void> {
  const input = parseOrThrow(lineUpdateInput, raw);
  const line = await findLine(lineId);
  if (line.kitInstanceId && (input.description !== undefined || input.quantity !== null)) throw new ValidationError({ _: KIT_LINE });
  await withDraft(actor, line.section.quoteId, async (tx) => {
    const data: Prisma.QuoteLineUpdateInput = {};
    if (input.description !== undefined) data.description = input.description;
    if (input.quantity !== null) data.quantity = input.quantity;
    if (input.visible !== undefined) data.visible = input.visible;
    await tx.quoteLine.update({ where: { id: lineId }, data });
    await logQuote(tx, actor, line.section.quoteId, "update", `Línea modificada: ${input.description ?? line.description}`);
  });
}

export async function moveLine(actor: CurrentUser, lineId: string, dir: -1 | 1): Promise<void> {
  const line = await findLine(lineId);
  if (line.kitInstanceId) throw new ValidationError({ _: KIT_LINE });
  await withDraft(actor, line.section.quoteId, async (tx) => {
    const siblings = await tx.quoteLine.findMany({ where: { sectionId: line.sectionId, kitInstanceId: null }, orderBy: { position: "asc" } });
    const i = siblings.findIndex((l) => l.id === lineId);
    const other = siblings[i + dir];
    if (!other) return;
    await tx.quoteLine.update({ where: { id: lineId }, data: { position: other.position } });
    await tx.quoteLine.update({ where: { id: other.id }, data: { position: siblings[i].position } });
  });
}

export async function removeLine(actor: CurrentUser, lineId: string): Promise<void> {
  const line = await findLine(lineId);
  if (line.kitInstanceId) throw new ValidationError({ _: KIT_LINE });
  await withDraft(actor, line.section.quoteId, async (tx) => {
    await tx.quoteLine.delete({ where: { id: lineId } });
    await logQuote(tx, actor, line.section.quoteId, "update", `Línea eliminada: ${line.description}`);
  });
}

/** Changes a line's unit price with a mandatory reason; the original price and the author stay on record (spec 5.5). */
export async function adjustPrice(actor: CurrentUser, lineId: string, raw: PriceAdjustInput): Promise<void> {
  const input = parseOrThrow(priceAdjustInput, raw);
  const line = await findLine(lineId);
  await withDraft(actor, line.section.quoteId, async (tx) => {
    const current = await tx.quoteLine.findUniqueOrThrow({ where: { id: lineId }, include: { section: true } });
    if (current.unitPrice === null || current.section.mode === "GLOBAL") throw new ValidationError({ _: "Esta línea es descriptiva: no tiene precio que ajustar" });
    await tx.priceAdjustment.create({ data: { lineId, originalPrice: current.unitPrice, newPrice: input.newPrice, reason: input.reason, userId: actor.id } });
    await tx.quoteLine.update({ where: { id: lineId }, data: { unitPrice: input.newPrice } });
    const fmt = (v: { toString(): string }) => formatDecimalEs(v, { max: 4 });
    await logQuote(tx, actor, line.section.quoteId, "adjust", `Ajuste de precio: ${current.description} ${fmt(current.unitPrice)} → ${fmt(input.newPrice)} (${input.reason})`);
  });
}

// ── Comments ───────────────────────────────────────────────────────────────────

/** Sets or clears (empty text) the comment of a line, a kit or a partida/subpartida of a draft. */
export async function setComment(actor: CurrentUser, raw: CommentInput): Promise<void> {
  const { kind, id, comment } = parseOrThrow(commentInput, raw);
  const target = kind === "line"
    ? await prisma.quoteLine.findUnique({ where: { id }, include: { section: true } }).then((l) => l && { quoteId: l.section.quoteId, label: `la línea «${l.description}»` })
    : kind === "kit"
      ? await prisma.kitInstance.findUnique({ where: { id }, include: { section: true } }).then((k) => k && { quoteId: k.section.quoteId, label: `el conjunto «${k.name}»` })
      : await prisma.quoteSection.findUnique({ where: { id } }).then((s) => s && { quoteId: s.quoteId, label: `la ${s.parentId ? "subpartida" : "partida"} «${s.title}»` });
  if (!target) throw new NotFoundError("El elemento no existe");
  await withDraft(actor, target.quoteId, async (tx) => {
    const data = { comment };
    if (kind === "line") await tx.quoteLine.update({ where: { id }, data });
    else if (kind === "kit") await tx.kitInstance.update({ where: { id }, data });
    else await tx.quoteSection.update({ where: { id }, data });
    await logQuote(tx, actor, target.quoteId, "update", `Comentario ${comment ? "guardado" : "quitado"} en ${target.label}`);
  });
}

// ── Required concepts ──────────────────────────────────────────────────────────

export async function listRequiredConcepts(): Promise<(RequiredConcept & { concept: Concept })[]> {
  return prisma.requiredConcept.findMany({ include: { concept: true }, orderBy: { concept: { code: "asc" } } });
}

/** A required concept left at zero on purpose needs a reason (spec 5.5); null removes the waiver. */
export async function setWaiver(actor: CurrentUser, quoteId: string, conceptId: string, reason: string | null): Promise<void> {
  const text = reason?.trim() ?? null;
  if (text !== null && (text.length === 0 || text.length > 300)) throw new ValidationError({ reason: "Escribe el motivo (máximo 300 caracteres)" });
  await withDraft(actor, quoteId, async (tx, quote) => {
    const required = await tx.requiredConcept.findUnique({ where: { conceptId }, include: { concept: true } });
    if (!required) throw new ValidationError({ _: "Ese concepto no es obligatorio" });
    const waivers = { ...((quote.waivers ?? {}) as Record<string, string>) };
    if (text === null) delete waivers[conceptId];
    else waivers[conceptId] = text;
    await tx.quote.update({ where: { id: quoteId }, data: { waivers } });
    await logQuote(tx, actor, quoteId, "update", text === null ? `${required.concept.code}: se quita la renuncia` : `${required.concept.code} a cero: ${text}`);
  });
}

export async function addRequiredConcept(actor: CurrentUser, conceptId: string): Promise<void> {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const c = await tx.concept.findUnique({ where: { id: conceptId } });
    if (!c?.active) throw new ValidationError({ conceptId: "Elige un concepto activo" });
    await tx.requiredConcept.upsert({ where: { conceptId }, create: { conceptId }, update: {} });
    await logAction(tx, { userId: actor.id, entity: "settings", entityId: "1", action: "update", summary: `Concepto obligatorio: ${c.code}` });
  });
}

export async function removeRequiredConcept(actor: CurrentUser, conceptId: string): Promise<void> {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const r = await tx.requiredConcept.findUnique({ where: { conceptId }, include: { concept: true } });
    if (!r) return;
    await tx.requiredConcept.delete({ where: { conceptId } });
    await logAction(tx, { userId: actor.id, entity: "settings", entityId: "1", action: "update", summary: `Ya no es obligatorio: ${r.concept.code}` });
  });
}
