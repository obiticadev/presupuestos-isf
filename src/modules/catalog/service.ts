import { prisma } from "@/lib/db";
import { formatDecimalEs } from "@/lib/decimal";
import { deleteOrDeactivate } from "@/lib/delete-or-deactivate";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { Prisma, type Concept } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import { conceptSnapshot, describeChanges, diffSnapshots, historyData } from "./history";
import { conceptInput, type ConceptInput } from "./schema";

export { suggestSalePrice } from "@/lib/decimal";

export const CONCEPTS_PAGE_SIZE = 50;
const INCLUDE = { category: true, unit: true, tax: true } as const;
export type ConceptDetail = Prisma.ConceptGetPayload<{ include: typeof INCLUDE }>;
export type ConceptRow = ConceptDetail;

export type ConceptFilter = {
  q?: string;
  categoryId?: string;
  status?: "active" | "inactive" | "all";
  validated?: "yes" | "no" | "all";
  page?: number;
};

export async function listConcepts(filter: ConceptFilter): Promise<{ items: ConceptRow[]; total: number }> {
  const { q, categoryId, status = "active", validated = "all", page = 1 } = filter;
  const term = q?.trim();
  const where: Prisma.ConceptWhereInput = {
    ...(status !== "all" && { active: status === "active" }),
    ...(validated !== "all" && { validated: validated === "yes" }),
    ...(categoryId && { categoryId }),
    ...(term && {
      OR: [{ code: { contains: term, mode: "insensitive" } }, { description: { contains: term, mode: "insensitive" } }],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.concept.findMany({
      where, include: INCLUDE, orderBy: { code: "asc" },
      skip: (Math.max(1, page) - 1) * CONCEPTS_PAGE_SIZE, take: CONCEPTS_PAGE_SIZE,
    }),
    prisma.concept.count({ where }),
  ]);
  return { items, total };
}

export async function getConcept(id: string): Promise<ConceptDetail> {
  const concept = await prisma.concept.findUnique({ where: { id }, include: INCLUDE });
  if (!concept) throw new NotFoundError("El concepto no existe");
  return concept;
}

export type ConceptOption = { id: string; code: string; description: string; categoryId: string; unitName: string; salePrice: string | null; active: boolean; validated: boolean };

/** Every concept in a light shape for pickers (kits, quote editor); callers filter by `active`. */
export async function listConceptOptions(): Promise<ConceptOption[]> {
  const rows = await prisma.concept.findMany({ include: { unit: true }, orderBy: { code: "asc" } });
  return rows.map((c) => ({
    id: c.id, code: c.code, description: c.description, categoryId: c.categoryId, unitName: c.unit.name,
    salePrice: c.salePrice?.toFixed() ?? null, active: c.active, validated: c.validated,
  }));
}

/** Every concept, active or not, for the Excel export. */
export async function exportConcepts(): Promise<ConceptDetail[]> {
  return prisma.concept.findMany({ include: INCLUDE, orderBy: { code: "asc" } });
}

type Parsed = ReturnType<typeof conceptInput.parse>;

/** Category, unit and tax must exist and be active, unless the concept already had that inactive one. */
async function checkRefs(tx: Prisma.TransactionClient, input: Parsed, current?: Concept): Promise<void> {
  const refs = [
    ["categoryId", await tx.category.findUnique({ where: { id: input.categoryId } })],
    ["unitId", await tx.unit.findUnique({ where: { id: input.unitId } })],
    ["taxId", await tx.tax.findUnique({ where: { id: input.taxId } })],
  ] as const;
  const issues: Record<string, string> = {};
  for (const [field, row] of refs) {
    if (!row) issues[field] = "No existe";
    else if (!row.active && row.id !== current?.[field]) issues[field] = "Está desactivado";
  }
  if (Object.keys(issues).length) throw new ValidationError(issues);
}

const price = (v: Prisma.Decimal | null) => (v ? formatDecimalEs(v, { max: 4 }) : "sin precio");

export function changeSummary(before: Concept, after: Concept): string {
  const changes: string[] = [];
  if (String(before.salePrice) !== String(after.salePrice)) changes.push(`precio ${price(before.salePrice)} → ${price(after.salePrice)}`);
  if (String(before.cost) !== String(after.cost)) changes.push(`coste ${price(before.cost)} → ${price(after.cost)}`);
  if (before.validated !== after.validated) changes.push(after.validated ? "validado" : "sin validar");
  return `${after.code}: ${changes.length ? changes.join(", ") : "datos actualizados"}`;
}

/** Maps the unique-code violation to a field error; two simultaneous inserts make a prior lookup unreliable. */
async function uniqueCode<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidationError({ code: "Ya existe un concepto con ese código" });
    }
    throw error;
  }
}

export async function createConcept(actor: CurrentUser, raw: ConceptInput): Promise<Concept> {
  const input = parseOrThrow(conceptInput, raw);
  return uniqueCode(() =>
    prisma.$transaction(async (tx) => {
      await checkRefs(tx, input);
      const created = await tx.concept.create({ data: input });
      const concept = await tx.concept.findUniqueOrThrow({ where: { id: created.id }, include: INCLUDE });
      await logAction(tx, {
        userId: actor.id, entity: "concept", entityId: concept.id, action: "create",
        summary: `Alta de ${concept.code}: ${concept.description} (${price(concept.salePrice)})`,
        data: historyData(concept, "manual"),
      });
      return concept;
    }),
  );
}

export async function updateConcept(actor: CurrentUser, id: string, raw: ConceptInput): Promise<Concept> {
  const input = parseOrThrow(conceptInput, raw);
  return uniqueCode(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.concept.findUnique({ where: { id }, include: INCLUDE });
      if (!before) throw new NotFoundError("El concepto no existe");
      await checkRefs(tx, input, before);
      await tx.concept.update({ where: { id }, data: input });
      const after = await tx.concept.findUniqueOrThrow({ where: { id }, include: INCLUDE });
      const changes = diffSnapshots(conceptSnapshot(after), conceptSnapshot(before));
      if (!changes.length) return before; // saving without changes is not a version
      await logAction(tx, {
        userId: actor.id, entity: "concept", entityId: id, action: "update",
        summary: `${after.code}: ${describeChanges(changes)}`, data: historyData(after, "manual"),
      });
      return after;
    }),
  );
}

export async function setConceptActive(actor: CurrentUser, id: string, active: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (!(await tx.concept.findUnique({ where: { id } }))) throw new NotFoundError("El concepto no existe");
    await tx.concept.update({ where: { id }, data: { active } });
    const concept = await tx.concept.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    await logAction(tx, {
      userId: actor.id, entity: "concept", entityId: id, action: active ? "reactivate" : "deactivate",
      summary: `${concept.code} ${active ? "activado" : "desactivado"}`, data: historyData(concept, "manual"),
    });
  });
}

/** «Eliminar»: deletes an unused concept; one referenced by quotes (plan 3) is deactivated instead. */
export async function removeConcept(actor: CurrentUser, id: string): Promise<"deleted" | "deactivated"> {
  const concept = await getConcept(id);
  return deleteOrDeactivate(
    () => prisma.$transaction(async (tx) => {
      await tx.concept.delete({ where: { id } });
      await logAction(tx, { userId: actor.id, entity: "concept", entityId: id, action: "delete", summary: `Baja de ${concept.code}: ${concept.description}`, data: historyData(concept, "manual") });
    }),
    () => prisma.$transaction(async (tx) => {
      await tx.concept.update({ where: { id }, data: { active: false } });
      await logAction(tx, { userId: actor.id, entity: "concept", entityId: id, action: "deactivate", summary: `${concept.code} desactivado porque está en uso`, data: historyData({ ...concept, active: false }, "manual") });
    }),
  );
}
