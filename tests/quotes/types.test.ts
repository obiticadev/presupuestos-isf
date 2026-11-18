import { prisma } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { deleteAllQuotes } from "@/modules/quotes/reset";
import { deleteQuoteType, formatTypeCode, listQuoteTypes, saveQuoteType, setQuoteTypeActive } from "@/modules/quotes/types";
import { makeDraft } from "../helpers/quotes";
import { makeUser } from "../helpers/users";

const errorsOf = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ValidationError);
  return (e as ValidationError).issues;
};

test("el código se guarda como número y se muestra con tres cifras", async () => {
  const admin = await makeUser("admin");
  const t = await saveQuoteType(admin, { name: "Proyectos", code: "7" });
  expect(t.code).toBe(7);
  expect(formatTypeCode(7)).toBe("007");
});

test("código fuera de 1-999, no numérico o nombre vacío se rechazan", async () => {
  const admin = await makeUser("admin");
  for (const code of ["0", "1000", "abc"]) expect((await errorsOf(saveQuoteType(admin, { name: "X", code }))).code).toBe("Código de 1 a 999");
  expect((await errorsOf(saveQuoteType(admin, { name: " ", code: "5" }))).name).toBeTruthy();
});

test("código repetido se rechaza", async () => {
  const admin = await makeUser("admin");
  await saveQuoteType(admin, { name: "A", code: 3 });
  expect(await errorsOf(saveQuoteType(admin, { name: "B", code: 3 }))).toEqual({ code: "Ya existe" });
});

test("un tipo usado cambia de nombre pero no de código, no se borra y se desactiva", async () => {
  const admin = await makeUser("admin");
  const t = await saveQuoteType(admin, { name: "Proyectos", code: 1 });
  const { quote } = await makeDraft();
  await prisma.quote.update({ where: { id: quote.id }, data: { typeId: t.id } });
  expect((await saveQuoteType(admin, { id: t.id, name: "Obras", code: 1 })).name).toBe("Obras");
  expect(await errorsOf(saveQuoteType(admin, { id: t.id, name: "Obras", code: 2 }))).toEqual({ code: "Ya se usa: el código no se cambia" });
  await expect(deleteQuoteType(admin, t.id)).rejects.toThrow(ValidationError);
  await setQuoteTypeActive(admin, t.id, false);
  expect((await listQuoteTypes()).some((x) => x.id === t.id)).toBe(false);
  expect((await listQuoteTypes({ includeInactive: true })).find((x) => x.id === t.id)?._count.quotes).toBe(1);
  // Tras borrar todos los presupuestos (Bloque 6) vuelve a estar sin usar.
  await deleteAllQuotes(admin, "BORRAR");
  await deleteQuoteType(admin, t.id);
  expect(await prisma.quoteType.findUnique({ where: { id: t.id } })).toBeNull();
});

test("el presupuestador no gestiona tipos", async () => {
  const p = await makeUser("presupuestador");
  await expect(saveQuoteType(p, { name: "X", code: 9 })).rejects.toThrow(ForbiddenError);
});
