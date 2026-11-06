import { auth } from "@/modules/auth/auth";
import { createAdmin, resetPassword } from "@/modules/auth/admin-cli";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";

test("createAdmin crea un admin que puede iniciar sesión", async () => {
  await createAdmin({ email: "admin@isf.test", name: "Admin", password: "contraseña-larga-1" });
  const r = await auth.api.signInEmail({ body: { email: "admin@isf.test", password: "contraseña-larga-1" } });
  expect((r.user as { role: string }).role).toBe("admin");
});

test("resetPassword cambia la contraseña: la nueva entra y la vieja no", async () => {
  await createAdmin({ email: "r@isf.test", name: "R", password: "contraseña-vieja-1" });
  await resetPassword({ email: "r@isf.test", password: "contraseña-nueva-1" });
  await expect(auth.api.signInEmail({ body: { email: "r@isf.test", password: "contraseña-vieja-1" } })).rejects.toThrow();
  await expect(auth.api.signInEmail({ body: { email: "r@isf.test", password: "contraseña-nueva-1" } })).resolves.toBeTruthy();
});

test("resetPassword reactiva al usuario y cierra sus sesiones", async () => {
  const { id } = await createAdmin({ email: "b@isf.test", name: "B", password: "contraseña-vieja-1" });
  await auth.api.signInEmail({ body: { email: "b@isf.test", password: "contraseña-vieja-1" } });
  await prisma.user.update({ where: { id }, data: { banned: true } });
  await resetPassword({ email: "b@isf.test", password: "contraseña-nueva-1" });
  expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
  expect((await prisma.user.findUniqueOrThrow({ where: { id } })).banned).toBe(false);
});

test("createAdmin con email repetido lanza ValidationError", async () => {
  await createAdmin({ email: "d@isf.test", name: "D", password: "contraseña-larga-1" });
  await expect(createAdmin({ email: "d@isf.test", name: "D", password: "contraseña-larga-1" })).rejects.toThrow(ValidationError);
});
