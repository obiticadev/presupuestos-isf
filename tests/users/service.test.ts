import { auth } from "@/modules/auth/auth";
import { prisma } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
  adminResetPassword,
  createUser,
  deactivateUser,
  listUsers,
  reactivateUser,
  setRole,
} from "@/modules/users/service";
import { makeUser } from "../helpers/users";

const LAST_ADMIN = "Debe quedar al menos un administrador activo";
const input = (email: string) => ({ name: "N", email, role: "presupuestador" as const, password: "contraseña-larga-1" });

test("un presupuestador no puede crear usuarios", async () => {
  const p = await makeUser("presupuestador");
  await expect(createUser(p, input("n@isf.test"))).rejects.toThrow(ForbiddenError);
});

test("un presupuestador no puede llamar a ninguna operación de administración", async () => {
  const p = await makeUser("presupuestador");
  const other = await makeUser("presupuestador");
  await expect(listUsers(p)).rejects.toThrow(ForbiddenError);
  await expect(setRole(p, p.id, "admin")).rejects.toThrow(ForbiddenError);
  await expect(deactivateUser(p, other.id)).rejects.toThrow(ForbiddenError);
  await expect(reactivateUser(p, other.id)).rejects.toThrow(ForbiddenError);
  await expect(adminResetPassword(p, other.id, "contraseña-nueva-1")).rejects.toThrow(ForbiddenError);
});

test("desactivar conserva el usuario, impide el login y cierra su sesión abierta", async () => {
  const admin = await makeUser("admin");
  const p = await makeUser("presupuestador", { email: "s@isf.test", password: "contraseña-larga-1" });
  const { token } = await auth.api.signInEmail({ body: { email: "s@isf.test", password: "contraseña-larga-1" } });
  await deactivateUser(admin, p.id);
  expect(await prisma.user.findUnique({ where: { id: p.id } })).not.toBeNull();
  expect(await prisma.session.findUnique({ where: { token } })).toBeNull();
  await expect(auth.api.signInEmail({ body: { email: "s@isf.test", password: "contraseña-larga-1" } })).rejects.toThrow();
});

test("reactivar devuelve el acceso", async () => {
  const admin = await makeUser("admin");
  const p = await makeUser("presupuestador", { email: "re@isf.test", password: "contraseña-larga-1" });
  await deactivateUser(admin, p.id);
  await reactivateUser(admin, p.id);
  await expect(auth.api.signInEmail({ body: { email: "re@isf.test", password: "contraseña-larga-1" } })).resolves.toBeTruthy();
});

test("no se puede desactivar ni degradar al último administrador activo", async () => {
  const admin = await makeUser("admin");
  await expect(deactivateUser(admin, admin.id)).rejects.toThrow(LAST_ADMIN);
  await expect(setRole(admin, admin.id, "presupuestador")).rejects.toThrow(LAST_ADMIN);
});

test("un admin desactivado no cuenta como administrador activo", async () => {
  const a1 = await makeUser("admin");
  const a2 = await makeUser("admin");
  await deactivateUser(a1, a2.id);
  await expect(setRole(a1, a1.id, "presupuestador")).rejects.toThrow(LAST_ADMIN);
});

test("con dos administradores sí se puede degradar a uno", async () => {
  const a1 = await makeUser("admin");
  const a2 = await makeUser("admin");
  await setRole(a1, a2.id, "presupuestador");
  expect((await prisma.user.findUniqueOrThrow({ where: { id: a2.id } })).role).toBe("presupuestador");
});

test("crear usuario deja constancia en el historial", async () => {
  const admin = await makeUser("admin");
  const u = await createUser(admin, { name: "H", email: "h@isf.test", role: "presupuestador", password: "contraseña-larga-1" });
  expect(await prisma.auditLog.count({ where: { entity: "user", entityId: u.id, action: "create" } })).toBe(1);
});

test("crear usuario con email repetido o datos inválidos da ValidationError por campo", async () => {
  const admin = await makeUser("admin");
  await createUser(admin, input("dup@isf.test"));
  await expect(createUser(admin, input("dup@isf.test"))).rejects.toMatchObject({ issues: { email: "Ya existe un usuario con ese email" } });
  await expect(createUser(admin, { ...input("x@isf.test"), password: "corta" })).rejects.toThrow(ValidationError);
});

test("restablecer la contraseña desde administración cambia la contraseña", async () => {
  const admin = await makeUser("admin");
  const p = await makeUser("presupuestador", { email: "pw@isf.test", password: "contraseña-vieja-1" });
  await adminResetPassword(admin, p.id, "contraseña-nueva-1");
  await expect(auth.api.signInEmail({ body: { email: "pw@isf.test", password: "contraseña-nueva-1" } })).resolves.toBeTruthy();
});

test("listUsers muestra primero los activos y después por nombre", async () => {
  const admin = await makeUser("admin", { email: "zeta@isf.test" });
  const b = await makeUser("presupuestador", { email: "beta@isf.test" });
  await makeUser("presupuestador", { email: "alfa@isf.test" });
  await deactivateUser(admin, b.id);
  expect((await listUsers(admin)).map((u) => [u.name, u.active])).toEqual([
    ["alfa", true],
    ["zeta", true],
    ["beta", false],
  ]);
});
