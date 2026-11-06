import { auth } from "@/modules/auth/auth";
import { prisma } from "@/lib/db";
import { makeUser } from "../helpers/users";

// Every user operation must go through our services (audit log, last-admin rule, no deletes).
// The Better Auth admin plugin's HTTP endpoints must therefore refuse even an admin session.
async function adminHeaders(): Promise<Headers> {
  await makeUser("admin", { email: "root@isf.test", password: "contraseña-larga-1" });
  const res = await auth.api.signInEmail({
    body: { email: "root@isf.test", password: "contraseña-larga-1" },
    returnHeaders: true,
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return new Headers({ cookie });
}

test("un admin no puede borrar usuarios con el endpoint del plugin", async () => {
  const headers = await adminHeaders();
  const p = await makeUser("presupuestador");
  await expect(auth.api.removeUser({ body: { userId: p.id }, headers })).rejects.toThrow();
  expect(await prisma.user.findUnique({ where: { id: p.id } })).not.toBeNull();
});

test("un admin no puede suplantar, banear ni cambiar roles con el plugin", async () => {
  const headers = await adminHeaders();
  const p = await makeUser("presupuestador");
  await expect(auth.api.impersonateUser({ body: { userId: p.id }, headers })).rejects.toThrow();
  await expect(auth.api.banUser({ body: { userId: p.id }, headers })).rejects.toThrow();
  await expect(auth.api.setRole({ body: { userId: p.id, role: "admin" }, headers })).rejects.toThrow();
});
