import { auth } from "@/modules/auth/auth";
import { assertAdmin } from "@/modules/auth/permissions";
import { ForbiddenError } from "@/lib/errors";
import { makeUser } from "../helpers/users";

test("un usuario creado inicia sesión con su contraseña", async () => {
  await makeUser("presupuestador", { email: "p@isf.test", password: "contraseña-larga-1" });
  const r = await auth.api.signInEmail({ body: { email: "p@isf.test", password: "contraseña-larga-1" } });
  expect(r.user.email).toBe("p@isf.test");
});

test("el registro público está deshabilitado", async () => {
  await expect(
    auth.api.signUpEmail({ body: { email: "x@isf.test", password: "contraseña-larga-1", name: "X" } }),
  ).rejects.toThrow();
});

test("assertAdmin rechaza a un presupuestador y acepta a un admin", () => {
  expect(() => assertAdmin({ id: "1", name: "P", email: "p", role: "presupuestador" })).toThrow(ForbiddenError);
  expect(() => assertAdmin({ id: "2", name: "A", email: "a", role: "admin" })).not.toThrow();
});
