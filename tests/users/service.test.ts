import { auth } from "@/modules/auth/auth";
import { prisma } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
  adminResetPassword,
  createUser,
  deactivateUser,
  deleteUser,
  listUsers,
  reactivateUser,
  renameUser,
  setRole,
} from "@/modules/users/service";
import type { CurrentUser } from "@/modules/auth/session";
import { listAudit } from "@/modules/audit/service";
import { issueQuote } from "@/modules/quotes/issue";
import { createRevision, listQuoteHistory } from "@/modules/quotes/lifecycle";
import { addNote, editNote, listNotes } from "@/modules/quotes/notes";
import { addCatalogLine, createDraft } from "@/modules/quotes/service";
import { completeDraft, makeClient, makeDraft } from "../helpers/quotes";
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

describe("eliminar y renombrar", () => {
  test("eliminar pasa sus borradores al admin y conserva su nombre en historial, notas y ajustes", async () => {
    const { actor, admin, quote, sub } = await makeDraft();
    await addNote(actor, quote.id, { text: "hola" });
    const line = await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-despl", quantity: "1" });
    await prisma.priceAdjustment.create({ data: { lineId: line.id, originalPrice: "1", newPrice: "2", reason: "r", userId: actor.id } });
    await deleteUser(admin, actor.id);

    expect(await prisma.user.findUnique({ where: { id: actor.id } })).toBeNull();
    expect(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ ownerId: admin.id, createdById: admin.id });
    const note = await prisma.quoteNote.findFirstOrThrow({ where: { quoteId: quote.id } });
    expect([note.authorId, note.authorName]).toEqual([null, actor.name]);
    expect((await listNotes(quote.id)).flatMap((g) => g.notes).map((n) => n.authorName)).toEqual([`${actor.name} (eliminado)`]);
    const { items } = await listAudit(admin, { entity: "quote", entityId: quote.id });
    expect(items.map((e) => e.userName)).toEqual(items.map(() => `${actor.name} (eliminado)`));
    const own = await listQuoteHistory(quote.id);
    expect(own.map((e) => e.userName)).toEqual(own.map(() => `${actor.name} (eliminado)`));
    await editNote(admin, note.id, { text: "editada" });
    const [edited] = (await listNotes(quote.id)).flatMap((g) => g.notes);
    expect([edited.authorName, edited.versions.map((v) => v.authorName)]).toEqual([admin.name, [`${actor.name} (eliminado)`]]);
    expect(await prisma.priceAdjustment.findFirstOrThrow({ where: { lineId: line.id } })).toMatchObject({ userId: null, userName: actor.name });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "user", entityId: actor.id, action: "delete" } });
    expect(log.summary).toContain(actor.email);
  });

  test("no se elimina a quien tiene algo emitido, a uno mismo ni lo hace un presupuestador", async () => {
    const { actor, admin, quote } = await completeDraft();
    await issueQuote(actor, quote.id);
    await expect(deleteUser(admin, actor.id)).rejects.toThrow(ValidationError);
    await expect(deleteUser(admin, admin.id)).rejects.toThrow(ValidationError);
    const other = await makeUser("presupuestador");
    await expect(deleteUser(other, admin.id)).rejects.toThrow(ForbiddenError);
    expect(await prisma.user.count({ where: { id: { in: [actor.id, admin.id] } } })).toBe(2);
  });

  test("eliminar a quien tiene un borrador que es revisión de un emitido ajeno", async () => {
    const { actor, admin, quote } = await completeDraft();
    await issueQuote(actor, quote.id);
    const rev = await createRevision(admin, quote.id);
    const b = await makeUser("presupuestador");
    await prisma.quote.update({ where: { id: rev.id }, data: { ownerId: b.id, createdById: b.id } });
    await deleteUser(admin, b.id);
    expect(await prisma.quote.findUniqueOrThrow({ where: { id: rev.id } })).toMatchObject({ ownerId: admin.id, parentId: quote.id });
  });

  test("listUsers cuenta emitidos y borradores", async () => {
    const { actor, admin, quote } = await completeDraft();
    await issueQuote(actor, quote.id);
    await makeDraftFor(actor);
    expect((await listUsers(admin)).find((u) => u.id === actor.id)).toMatchObject({ issued: 1, drafts: 1 });
  });

  test("renombrar solo a quien no ha emitido, con nombre no vacío", async () => {
    const { actor, admin, quote } = await makeDraft();
    await renameUser(admin, actor.id, "  Nuevo Nombre ");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).name).toBe("Nuevo Nombre");
    await expect(renameUser(admin, actor.id, "  ")).rejects.toThrow(ValidationError);
    await expect(renameUser(actor, actor.id, "X")).rejects.toThrow(ForbiddenError);
    await prisma.quote.update({ where: { id: quote.id }, data: { status: "ISSUED" } });
    await expect(renameUser(admin, actor.id, "Otro")).rejects.toThrow(ValidationError);
  });
});

async function makeDraftFor(actor: CurrentUser) {
  const { client } = await makeClient(actor);
  return createDraft(actor, { clientId: client.id });
}
