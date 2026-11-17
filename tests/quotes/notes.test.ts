import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { buildDocument, toPdfSource } from "@/pdf/document";
import { TEMPLATES } from "@/pdf/templates";
import { issueQuote } from "@/modules/quotes/issue";
import { createRevision, duplicateQuote } from "@/modules/quotes/lifecycle";
import { addNote, deleteNote, editNote, listNotes } from "@/modules/quotes/notes";
import { deleteDraft, getQuote } from "@/modules/quotes/service";
import { getSettings } from "@/modules/settings/service";
import { completeDraft, makeDraft } from "../helpers/quotes";
import { makeUser } from "../helpers/users";

test("añadir una nota la guarda con autor y fecha, sin cambiar el responsable", async () => {
  const { actor, quote } = await makeDraft();
  const other = await makeUser("presupuestador");
  await addNote(other, quote.id, { text: "  2 viajes × 25 km  " });
  const groups = await listNotes(quote.id);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ quoteId: quote.id, revision: 0, editable: true });
  expect(groups[0].notes).toMatchObject([{ text: "2 viajes × 25 km", authorId: other.id, edited: false, versions: [] }]);
  expect((await getQuote(quote.id)).ownerId).toBe(actor.id);
  expect(await prisma.auditLog.count({ where: { entityId: quote.id, action: "note.create" } })).toBe(1);
});

test("editar una nota ajena la pasa al editor, guarda la versión anterior y la marca editada", async () => {
  const { actor, quote } = await makeDraft();
  const other = await makeUser("presupuestador");
  const note = await addNote(actor, quote.id, { text: "uno" });
  await editNote(other, note.id, { text: "dos" });
  let [n] = (await listNotes(quote.id))[0].notes;
  expect(n).toMatchObject({ text: "dos", authorId: other.id, edited: true });
  expect(n.versions.map((v) => [v.text, v.authorName])).toEqual([["uno", actor.name]]);
  expect(n.updatedAt.getTime()).toBeGreaterThanOrEqual(note.updatedAt.getTime());
  await editNote(actor, note.id, { text: "tres" });
  [n] = (await listNotes(quote.id))[0].notes;
  expect(n.versions.map((v) => v.text)).toEqual(["uno", "dos"]);
  expect((await getQuote(quote.id)).ownerId).toBe(actor.id);
});

test("editar con el mismo texto no crea versión ni cambia autor ni fecha", async () => {
  const { actor, quote } = await makeDraft();
  const other = await makeUser("presupuestador");
  const note = await addNote(actor, quote.id, { text: "igual" });
  await editNote(other, note.id, { text: " igual " });
  const [n] = (await listNotes(quote.id))[0].notes;
  expect(n).toMatchObject({ authorId: actor.id, edited: false, versions: [] });
  expect(n.updatedAt).toEqual(note.updatedAt);
});

test("texto vacío o de más de 1000 caracteres se rechaza", async () => {
  const { actor, quote } = await makeDraft();
  await expect(addNote(actor, quote.id, { text: "   " })).rejects.toThrow(ValidationError);
  await expect(addNote(actor, quote.id, { text: "x".repeat(1001) })).rejects.toThrow(ValidationError);
  const note = await addNote(actor, quote.id, { text: "x".repeat(1000) });
  await expect(editNote(actor, note.id, { text: "" })).rejects.toThrow(ValidationError);
});

test("borrar una nota borra sus versiones", async () => {
  const { actor, quote } = await makeDraft();
  const note = await addNote(actor, quote.id, { text: "uno" });
  await editNote(actor, note.id, { text: "dos" });
  await deleteNote(actor, note.id);
  expect((await listNotes(quote.id))[0].notes).toEqual([]);
  expect(await prisma.quoteNoteVersion.count({ where: { noteId: note.id } })).toBe(0);
});

test("una nota emitida no se edita ni se borra; la revisión la muestra en solo lectura", async () => {
  const { actor, quote } = await completeDraft();
  const note = await addNote(actor, quote.id, { text: "de R0" });
  await issueQuote(actor, quote.id);
  await expect(addNote(actor, quote.id, { text: "tarde" })).rejects.toThrow(ValidationError);
  const rev = await createRevision(actor, quote.id);
  const groups = await listNotes(rev.id);
  expect(groups.map((g) => [g.quoteId, g.revision, g.editable, g.notes.map((n) => n.text)])).toEqual([
    [quote.id, 0, false, ["de R0"]],
    [rev.id, 1, true, []],
  ]);
  expect(groups[0].issuedAt).not.toBeNull();
  await expect(editNote(actor, note.id, { text: "cambio" })).rejects.toThrow(ValidationError);
  await expect(deleteNote(actor, note.id)).rejects.toThrow(ValidationError);
  await addNote(actor, rev.id, { text: "de R1" });
  expect((await listNotes(rev.id))[1].notes.map((n) => n.text)).toEqual(["de R1"]);
});

test("duplicar no arrastra notas", async () => {
  const { actor, quote } = await makeDraft();
  await addNote(actor, quote.id, { text: "solo del original" });
  const { quote: dup } = await duplicateQuote(actor, quote.id);
  expect(await listNotes(dup.id)).toMatchObject([{ quoteId: dup.id, notes: [] }]);
});

test("borrar un borrador con notas editadas funciona", async () => {
  const { actor, quote } = await makeDraft();
  const note = await addNote(actor, quote.id, { text: "uno" });
  await editNote(actor, note.id, { text: "dos" });
  await deleteDraft(actor, quote.id);
  expect(await prisma.quoteNote.count({ where: { quoteId: quote.id } })).toBe(0);
});

test("las notas nunca llegan a la instantánea ni al PDF", async () => {
  const { actor, quote } = await completeDraft();
  await addNote(actor, quote.id, { text: "SECRETO-INTERNO" });
  const draftBody = TEMPLATES.v1.body(buildDocument(toPdfSource(await getSettings(), await getQuote(quote.id)), { draft: true }));
  expect(draftBody).not.toContain("SECRETO-INTERNO");
  await issueQuote(actor, quote.id);
  const doc = await prisma.issuedDocument.findUniqueOrThrow({ where: { quoteId: quote.id } });
  expect(JSON.stringify(doc.snapshot)).not.toContain("SECRETO-INTERNO");
});
