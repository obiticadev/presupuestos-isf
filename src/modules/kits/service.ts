import { z } from "zod";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { Prisma, type KitTemplate } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/auth/session";
import { kitDefinition, refCategoryId, refConceptId, type KitDefinition } from "./definition";

export type Kit = Omit<KitTemplate, "definition"> & { definition: KitDefinition };

const kitInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Escribe el nombre").max(100, "Máximo 100 caracteres"),
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

/** Every concept and category the definition names must exist and be active. */
async function checkRefs(tx: Prisma.TransactionClient, def: KitDefinition): Promise<void> {
  const refs = [{ path: "definition.main", ref: def.main }, ...def.components.map((c, i) => ({ path: `definition.components.${i}.ref`, ref: c.ref }))];
  const issues: Record<string, string> = {};
  for (const { path, ref } of refs) {
    const conceptId = refConceptId(ref);
    const categoryId = refCategoryId(ref);
    if (conceptId) {
      const c = await tx.concept.findUnique({ where: { id: conceptId } });
      if (!c?.active) issues[path] = "El concepto no existe o está desactivado";
    } else if (categoryId) {
      const c = await tx.category.findUnique({ where: { id: categoryId } });
      if (!c?.active) issues[path] = "La categoría no existe o está desactivada";
    }
  }
  if (Object.keys(issues).length) throw new ValidationError(issues);
}

export async function saveKit(actor: CurrentUser, raw: KitInput): Promise<Kit> {
  const input = parseOrThrow(kitInput, raw);
  try {
    return await prisma.$transaction(async (tx) => {
      await checkRefs(tx, input.definition);
      const data = { name: input.name, description: input.description, definition: input.definition as Prisma.InputJsonValue };
      const before = input.id ? await tx.kitTemplate.findUnique({ where: { id: input.id } }) : null;
      if (input.id && !before) throw new NotFoundError("Conjunto no encontrado");
      const row = before ? await tx.kitTemplate.update({ where: { id: before.id }, data }) : await tx.kitTemplate.create({ data });
      await logAction(tx, {
        userId: actor.id, entity: "kit", entityId: row.id, action: before ? "update" : "create",
        summary: before ? `Conjunto ${row.name} modificado` : `Alta del conjunto ${row.name}`, data: input.definition,
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
