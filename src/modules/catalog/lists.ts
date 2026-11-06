import { z } from "zod";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import type { Category, Unit } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";

// Categories and units behave the same: a name, renamed or deactivated, never deleted.
const listInput = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Escribe el nombre").max(50, "Máximo 50 caracteres") });
export type ListInput = z.input<typeof listInput>;

type Kind = { model: "category" | "unit"; label: string };
const CATEGORY: Kind = { model: "category", label: "Categoría" };
const UNIT: Kind = { model: "unit", label: "Unidad" };

// Both delegates share the same shape; the cast keeps one implementation for the two tables.
type Delegate = typeof prisma.category;
const table = (tx: Pick<typeof prisma, "category" | "unit">, kind: Kind) => tx[kind.model] as unknown as Delegate;

async function list(kind: Kind, opts: { includeInactive?: boolean }) {
  return table(prisma, kind).findMany({ where: opts.includeInactive ? undefined : { active: true }, orderBy: { name: "asc" } });
}

async function save(kind: Kind, actor: CurrentUser, raw: ListInput) {
  assertAdmin(actor);
  const input = parseOrThrow(listInput, raw);
  return prisma.$transaction(async (tx) => {
    const t = table(tx, kind);
    const clash = await t.findUnique({ where: { name: input.name } });
    if (clash && clash.id !== input.id) throw new ValidationError({ name: "Ya existe" });
    const before = input.id ? await t.findUnique({ where: { id: input.id } }) : null;
    if (input.id && !before) throw new NotFoundError(`${kind.label} no encontrada`);
    const row = input.id ? await t.update({ where: { id: input.id }, data: { name: input.name } }) : await t.create({ data: { name: input.name } });
    await logAction(tx, {
      userId: actor.id, entity: kind.model, entityId: row.id, action: before ? "update" : "create",
      summary: before ? `${kind.label} ${before.name} renombrada a ${row.name}` : `Alta de ${kind.label.toLowerCase()} ${row.name}`,
    });
    return row;
  });
}

async function setActive(kind: Kind, actor: CurrentUser, id: string, active: boolean) {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const t = table(tx, kind);
    const row = await t.findUnique({ where: { id } });
    if (!row) throw new NotFoundError(`${kind.label} no encontrada`);
    await t.update({ where: { id }, data: { active } });
    await logAction(tx, {
      userId: actor.id, entity: kind.model, entityId: id, action: active ? "reactivate" : "deactivate",
      summary: `${kind.label} ${row.name} ${active ? "activada" : "desactivada"}`,
    });
  });
}

export const listCategories = (opts: { includeInactive?: boolean } = {}): Promise<Category[]> => list(CATEGORY, opts);
export const saveCategory = (actor: CurrentUser, input: ListInput): Promise<Category> => save(CATEGORY, actor, input);
export const setCategoryActive = (actor: CurrentUser, id: string, active: boolean) => setActive(CATEGORY, actor, id, active);
export const listUnits = (opts: { includeInactive?: boolean } = {}): Promise<Unit[]> => list(UNIT, opts);
export const saveUnit = (actor: CurrentUser, input: ListInput): Promise<Unit> => save(UNIT, actor, input);
export const setUnitActive = (actor: CurrentUser, id: string, active: boolean) => setActive(UNIT, actor, id, active);
