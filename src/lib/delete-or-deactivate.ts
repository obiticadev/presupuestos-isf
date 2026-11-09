import { Prisma } from "@/generated/prisma/client";

/**
 * "Eliminar" for things that may be in use: deletes, and if a RESTRICT foreign key blocks it, deactivates instead.
 * `del` must run in its own transaction: a failed DELETE aborts the PostgreSQL transaction it runs in.
 */
export async function deleteOrDeactivate(
  del: () => Promise<unknown>,
  deactivate: () => Promise<unknown>,
): Promise<"deleted" | "deactivated"> {
  try {
    await del();
    return "deleted";
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2003") throw error;
    await deactivate();
    return "deactivated";
  }
}
