import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { listAudit, logAction } from "@/modules/audit/service";
import { makeUser } from "../helpers/users";

test("logAction guarda la entrada y listAudit la devuelve al admin", async () => {
  const admin = await makeUser("admin");
  await logAction(prisma, { userId: admin.id, entity: "user", entityId: admin.id, action: "create", summary: "Alta de usuario" });
  const { items, total } = await listAudit(admin, { entity: "user" });
  expect(total).toBe(1);
  expect(items[0]).toMatchObject({ action: "create", summary: "Alta de usuario", userName: admin.name });
});

test("listAudit rechaza a un presupuestador", async () => {
  const p = await makeUser("presupuestador");
  await expect(listAudit(p, {})).rejects.toThrow(ForbiddenError);
});

test("listAudit pagina de 50 en 50, del más reciente al más antiguo", async () => {
  const admin = await makeUser("admin");
  for (let i = 0; i < 51; i++) {
    await logAction(prisma, { userId: null, entity: "settings", entityId: "1", action: "update", summary: `cambio ${i}` });
  }
  const first = await listAudit(admin, { entity: "settings" });
  const second = await listAudit(admin, { entity: "settings", page: 2 });
  expect(first.total).toBe(51);
  expect(first.items).toHaveLength(50);
  expect(first.items[0].summary).toBe("cambio 50");
  expect(second.items.map((x) => x.summary)).toEqual(["cambio 0"]);
});
