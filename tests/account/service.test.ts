import { prisma } from "@/lib/db";
import { auth } from "@/modules/auth/auth";
import { changeOwnPassword, checkSignaturePng, deleteSignature, getSignature, saveSignature } from "@/modules/account/service";
import { makeUser, TEST_SIGNATURE } from "../helpers/users";

/** A PNG header with the given IHDR size, padded to `length` bytes. */
function png(width: number, height: number, length = 64): Uint8Array {
  const b = Buffer.alloc(length);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

async function sessionHeaders(email: string, password: string): Promise<Headers> {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  return new Headers({ cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}

test("checkSignaturePng solo acepta un PNG de hasta 200 KB y tamaño razonable", () => {
  expect(() => checkSignaturePng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toThrow("La firma debe ser una imagen PNG");
  expect(() => checkSignaturePng(png(400, 100, 204_801))).toThrow("La firma no puede pasar de 200 KB");
  expect(() => checkSignaturePng(png(5000, 100))).toThrow("Tamaño de firma no válido");
  expect(() => checkSignaturePng(png(10, 5))).toThrow("Tamaño de firma no válido");
  const noIhdr = Buffer.from(png(400, 100));
  noIhdr.write("tEXt", 12, "ascii");
  expect(() => checkSignaturePng(noIhdr)).toThrow("La firma debe ser una imagen PNG");
  expect(() => checkSignaturePng(TEST_SIGNATURE)).not.toThrow();
});

test("guardar y eliminar la firma, con su historial y sin la imagen", async () => {
  const u = await makeUser("presupuestador", { signature: false });
  expect(await getSignature(u.id)).toBeNull();
  await saveSignature(u, TEST_SIGNATURE);
  expect(Buffer.from((await getSignature(u.id))!).equals(Buffer.from(TEST_SIGNATURE))).toBe(true);
  await deleteSignature(u);
  expect(await getSignature(u.id)).toBeNull();
  const log = await prisma.auditLog.findMany({ where: { entityId: u.id, action: "signature" }, orderBy: { createdAt: "asc" } });
  expect(log.map((l) => [l.summary, l.data])).toEqual([["Firma actualizada", null], ["Firma eliminada", null]]);
});

test("una firma que no es PNG no se guarda", async () => {
  const u = await makeUser("presupuestador", { signature: false });
  await expect(saveSignature(u, Buffer.from("no es un png"))).rejects.toThrow("La firma debe ser una imagen PNG");
  expect(await getSignature(u.id)).toBeNull();
});

test("cambiar la contraseña exige la actual y que las nuevas coincidan", async () => {
  const u = await makeUser("presupuestador", { password: "contraseña-vieja-1" });
  const headers = await sessionHeaders(u.email, "contraseña-vieja-1");
  await expect(changeOwnPassword(u, { current: "otra-cosa-123", next: "contraseña-nueva-1", repeat: "contraseña-nueva-1" }, headers))
    .rejects.toMatchObject({ issues: { current: "La contraseña actual no es correcta" } });
  await expect(changeOwnPassword(u, { current: "contraseña-vieja-1", next: "contraseña-nueva-1", repeat: "distinta-12345" }, headers))
    .rejects.toMatchObject({ issues: { repeat: "Las contraseñas no coinciden" } });
  await expect(changeOwnPassword(u, { current: "contraseña-vieja-1", next: "corta", repeat: "corta" }, headers))
    .rejects.toMatchObject({ issues: { next: "La contraseña debe tener al menos 10 caracteres" } });
  await changeOwnPassword(u, { current: "contraseña-vieja-1", next: "contraseña-nueva-1", repeat: "contraseña-nueva-1" }, headers);
  await expect(auth.api.signInEmail({ body: { email: u.email, password: "contraseña-nueva-1" } })).resolves.toBeTruthy();
  expect(await prisma.auditLog.count({ where: { entityId: u.id, action: "password" } })).toBe(1);
});

test("cambiar la contraseña cierra las demás sesiones", async () => {
  const u = await makeUser("presupuestador", { password: "contraseña-vieja-1" });
  const other = await sessionHeaders(u.email, "contraseña-vieja-1");
  const mine = await sessionHeaders(u.email, "contraseña-vieja-1");
  await changeOwnPassword(u, { current: "contraseña-vieja-1", next: "contraseña-nueva-1", repeat: "contraseña-nueva-1" }, mine);
  expect(await auth.api.getSession({ headers: other })).toBeNull();
});
