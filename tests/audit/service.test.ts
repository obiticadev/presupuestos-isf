import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { listAudit, listAuditUserNames, logAction } from "@/modules/audit/service";
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

describe("filtros", () => {
  const add = (userId: string | null, summary: string, createdAt: string, userName: string | null = null) =>
    prisma.auditLog.create({ data: { userId, userName, entity: "quote", entityId: "q", action: "issue", summary, createdAt: new Date(createdAt) } });

  test("desde/hasta cuentan días de Madrid, con «hasta» incluido", async () => {
    const admin = await makeUser("admin");
    await add(admin.id, "a", "2026-03-10T23:30:00Z"); // 11-03 00:30 en Madrid
    await add(admin.id, "d", "2026-03-11T22:30:00Z"); // 11-03 23:30 en Madrid
    await add(admin.id, "b", "2026-03-11T23:30:00Z"); // 12-03 00:30 en Madrid
    await add(admin.id, "c", "2026-03-10T22:59:00Z"); // 10-03 23:59 en Madrid
    const { items } = await listAudit(admin, { from: "2026-03-11", to: "2026-03-11" });
    expect(items.map((e) => e.summary)).toEqual(["d", "a"]);
    // 29-03 dura 23 h: «hasta» no debe colarse en la primera hora del 30-03 (2026-03-29T22:00Z)
    await add(admin.id, "e", "2026-03-29T22:30:00Z");
    expect((await listAudit(admin, { to: "2026-03-29", from: "2026-03-29" })).items).toEqual([]);
  });

  test("texto sin distinguir mayúsculas, usuario por nombre (también eliminados) y Sistema", async () => {
    const admin = await makeUser("admin");
    await add(admin.id, "PR-2026001 emitido", "2026-03-10T10:00:00Z");
    await add(null, "caducado", "2026-03-10T11:00:00Z");
    await add(null, "de un eliminado", "2026-03-10T12:00:00Z", "Antonio Ruiz");
    const summaries = async (f: Parameters<typeof listAudit>[1]) => (await listAudit(admin, { entity: "quote", ...f })).items.map((e) => e.summary);
    expect(await summaries({ q: "pr-2026" })).toEqual(["PR-2026001 emitido"]);
    expect(await summaries({ userName: "Sistema" })).toEqual(["caducado"]);
    expect(await summaries({ userName: "Antonio Ruiz" })).toEqual(["de un eliminado"]);
    expect(await summaries({ userName: admin.name, action: "issue" })).toEqual(["PR-2026001 emitido"]);
    expect(await listAuditUserNames()).toEqual(expect.arrayContaining(["Antonio Ruiz", admin.name]));
  });
});
