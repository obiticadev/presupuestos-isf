import { prisma } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { listCategories, listUnits, saveCategory, saveUnit, setCategoryActive } from "@/modules/catalog/lists";
import { makeUser } from "../helpers/users";

test("la semilla trae las cinco categorías y las cuatro unidades", async () => {
  expect((await listCategories()).map((c) => c.name)).toEqual(["Bombas", "Mangueras", "Material", "Personal", "Servicios"]);
  expect((await listUnits()).map((u) => u.name)).toEqual(["h", "km", "m", "ud"]);
});

test("una categoría desactivada solo se lista si se pide", async () => {
  const admin = await makeUser("admin");
  await setCategoryActive(admin, "cat-material", false);
  expect((await listCategories()).some((c) => c.id === "cat-material")).toBe(false);
  expect((await listCategories({ includeInactive: true })).some((c) => c.id === "cat-material")).toBe(true);
});

test("nombre repetido y presupuestador se rechazan", async () => {
  const admin = await makeUser("admin");
  await expect(saveUnit(admin, { name: "km" })).rejects.toThrow(ValidationError);
  const p = await makeUser("presupuestador");
  await expect(saveCategory(p, { name: "Nueva" })).rejects.toThrow(ForbiddenError);
});

test("renombrar una unidad lo registra en el historial", async () => {
  const admin = await makeUser("admin");
  await saveUnit(admin, { id: "unit-ud", name: "uds" });
  expect((await listUnits()).map((u) => u.name)).toContain("uds");
  expect(await prisma.auditLog.count({ where: { entity: "unit", entityId: "unit-ud" } })).toBe(1);
});
