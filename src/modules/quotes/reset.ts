import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { logAction } from "@/modules/audit/service";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";
import { dataDir } from "@/modules/settings/service";

/** Danger zone: every quote with its dependants, their history and the counters go; then the PDF folder. */
export async function deleteAllQuotes(actor: CurrentUser, confirm: string): Promise<number> {
  assertAdmin(actor);
  if (confirm !== "BORRAR") throw new ValidationError({ confirm: "Escribe BORRAR para confirmar" });
  const count = await prisma.$transaction(async (tx) => {
    const n = await tx.quote.count();
    // CASCADE empties every table that references Quote (sections, lines, adjustments, kits, issued documents, notes),
    // whatever their own onDelete, including the Restrict self-references between revisions.
    await tx.$executeRawUnsafe(`TRUNCATE "Quote" CASCADE`);
    await tx.auditLog.deleteMany({ where: { entity: "quote" } });
    await tx.numberCounter.deleteMany();
    await logAction(tx, { userId: actor.id, entity: "quote", entityId: "all", action: "delete", summary: `Borrados todos los presupuestos (${n})` });
    return n;
  });
  // Only after the commit: a failed transaction must leave the PDFs of the quotes it kept.
  await rm(path.join(dataDir(), "pdf"), { recursive: true, force: true });
  return count;
}
