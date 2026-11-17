import { NextRequest } from "next/server";
import { getCookies } from "better-auth/cookies";

vi.mock("@/lib/db", () => ({ prisma: {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function environment(prefix?: string) {
  vi.stubEnv("BETTER_AUTH_COOKIE_PREFIX", prefix);
  vi.resetModules();
  const { auth } = await import("@/modules/auth/auth");
  const { proxy } = await import("@/proxy");
  return { options: auth.options, proxy };
}

function request(cookie: string) {
  return new NextRequest("http://192.168.105.83:3101/clientes", {
    headers: { cookie },
  });
}

test("sin configuración conserva los nombres y las sesiones de producción", async () => {
  const { options, proxy } = await environment();
  expect(getCookies(options).sessionToken.name).toBe("better-auth.session_token");
  expect(proxy(request("better-auth.session_token=production")).status).toBe(200);
});

test("pruebas emite cookies propias y el proxy reconoce su sesión", async () => {
  const { options, proxy } = await environment("isf-pruebas");
  const cookies = getCookies(options);
  expect(cookies.sessionToken.name).toBe("isf-pruebas.session_token");
  expect(cookies.sessionData.name).toBe("isf-pruebas.session_data");
  expect(cookies.dontRememberToken.name).toBe("isf-pruebas.dont_remember");
  expect(proxy(request("isf-pruebas.session_token=testing")).status).toBe(200);
  expect(proxy(request("better-auth.session_token=production")).headers.get("location"))
    .toBe("http://192.168.105.83:3101/login");
});

test("las dos cookies pueden coexistir sin que un entorno use la del otro", async () => {
  const both = "better-auth.session_token=production; isf-pruebas.session_token=testing";
  const production = await environment();
  expect(production.proxy(request(both)).status).toBe(200);
  expect(production.proxy(request("isf-pruebas.session_token=testing")).status).toBe(307);
  const testing = await environment("isf-pruebas");
  expect(testing.proxy(request(both)).status).toBe(200);
  expect(testing.proxy(request("")).status).toBe(307);
});
