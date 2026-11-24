import { z } from "zod";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { Prisma, type KitTemplate } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import { kitDefinition, refCategoryId, refConceptId, type KitDefinition } from "./definition";
import { categoryPrefix, codePrefix, kitBaseName, uniqueName } from "./naming";

type Db = Prisma.TransactionClient | typeof prisma;
export type Kit = Omit<KitTemplate, "definition"> & { definition: KitDefinition };

const kitInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Escribe el nombre").max(100, "Máximo 100 caracteres").optional(),
  description: z.string().trim().max(2000, "Máximo 2000 caracteres"),
  definition: kitDefinition,
});
export type KitInput = z.input<typeof kitInput>;

// Stored definitions were validated on save; parsing again keeps the type honest if the JSON was touched by hand.
const toKit = (row: KitTemplate): Kit => ({ ...row, definition: kitDefinition.parse(row.definition) });

export async function listKits(opts: { includeInactive?: boolean } = {}): Promise<Kit[]> {
  const rows = await prisma.kitTemplate.findMany({ where: opts.includeInactive ? undefined : { active: true }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return rows.map(toKit);
}

export async function getKit(id: string): Promise<Kit> {
  const row = await prisma.kitTemplate.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Conjunto no encontrado");
  return toKit(row);
}

/** What is wrong with the concepts and categories a definition names: each must exist and be active. Keyed by field path. */
async function refIssues(tx: Db, def: KitDefinition): Promise<Record<string, string>> {
  const refs = [{ path: "definition.main", ref: def.main }, ...def.components.map((c, i) => ({ path: `definition.components.${i}.ref`, ref: c.ref }))];
  const issues: Record<string, string> = {};
  for (const { path, ref } of refs) {
    const conceptId = refConceptId(ref);
    const categoryId = refCategoryId(ref);
    if (conceptId) {
      const c = await tx.concept.findUnique({ where: { id: conceptId } });
      if (!c) issues[path] = "Falta un concepto que ya no existe";
      else if (!c.active) issues[path] = `${c.code} está desactivado: cámbialo por otro`;
    } else if (categoryId) {
      const c = await tx.category.findUnique({ where: { id: categoryId } });
      if (!c) issues[path] = "Falta una categoría que ya no existe";
      else if (!c.active) issues[path] = `La categoría ${c.name} está desactivada`;
    }
  }
  return issues;
}

/** The warnings of a stored kit (a concept or category it names was deactivated or deleted); empty = complete. */
export async function kitIssues(tx: Prisma.TransactionClient | typeof prisma, kit: Kit): Promise<string[]> {
  return Object.values(await refIssues(tx, kit.definition));
}

async function refPrefix(tx: Db, ref: KitDefinition["main"] | KitDefinition["components"][number]["ref"]): Promise<string> {
  const conceptId = refConceptId(ref);
  if (conceptId) return codePrefix((await tx.concept.findUnique({ where: { id: conceptId } }))?.code ?? "");
  return categoryPrefix((await tx.category.findUnique({ where: { id: refCategoryId(ref)! } }))?.name ?? "");
}

/** The automatic name (spec 5.3): base name, or base-2, base-3… if another kit already has it. */
export async function autoKitName(tx: Db, def: KitDefinition, excludeId?: string): Promise<string> {
  const base = kitBaseName(await refPrefix(tx, def.main), await Promise.all(def.components.filter((c) => c.inName).map((c) => refPrefix(tx, c.ref))));
  const taken = await tx.kitTemplate.findMany({ where: excludeId ? { id: { not: excludeId } } : undefined, select: { name: true } });
  return uniqueName(base, taken.map((k) => k.name));
}

/** Without a name, the kit gets the automatic one and its first two letters as the symbol. */
export async function saveKit(actor: CurrentUser, raw: KitInput): Promise<Kit> {
  const input = parseOrThrow(kitInput, raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const issues = await refIssues(tx, input.definition);
      if (Object.keys(issues).length) throw new ValidationError(issues);
      const name = input.name ?? (await autoKitName(tx, input.definition, input.id));
      const definition = input.name ? input.definition : { ...input.definition, main: { ...input.definition.main, symbol: name.slice(0, 2) } };
      const data = { name, description: input.description, definition: definition as Prisma.InputJsonValue };
      const before = input.id ? await tx.kitTemplate.findUnique({ where: { id: input.id } }) : null;
      if (input.id && !before) throw new NotFoundError("Conjunto no encontrado");
      const row = before ? await tx.kitTemplate.update({ where: { id: before.id }, data }) : await tx.kitTemplate.create({ data });
      await logAction(tx, {
        userId: actor.id, entity: "kit", entityId: row.id, action: before ? "update" : "create",
        summary: before ? `Conjunto ${row.name} modificado` : `Alta del conjunto ${row.name}`, data: definition,
      });
      return toKit(row);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationError({ name: "Ya existe un conjunto con ese nombre" });
    throw e;
  }
}

export async function setKitActive(actor: CurrentUser, id: string, active: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.kitTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Conjunto no encontrado");
    await tx.kitTemplate.update({ where: { id }, data: { active } });
    await logAction(tx, {
      userId: actor.id, entity: "kit", entityId: id, action: active ? "reactivate" : "deactivate",
      summary: `Conjunto ${row.name} ${active ? "activado" : "desactivado"}`,
    });
  });
}
