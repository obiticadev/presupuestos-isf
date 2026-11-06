import { Prisma } from "@/generated/prisma/client";
import { deleteOrDeactivate } from "@/lib/delete-or-deactivate";

const fk = () => new Prisma.PrismaClientKnownRequestError("fk", { code: "P2003", clientVersion: "7.10.1" });

test("si se puede borrar, borra", async () => {
  expect(await deleteOrDeactivate(async () => {}, async () => { throw new Error("no"); })).toBe("deleted");
});

test("si una FK lo impide, desactiva", async () => {
  expect(await deleteOrDeactivate(async () => { throw fk(); }, async () => {})).toBe("deactivated");
});

test("otros errores se relanzan", async () => {
  await expect(deleteOrDeactivate(async () => { throw new Error("x"); }, async () => {})).rejects.toThrow("x");
});
