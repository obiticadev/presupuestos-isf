// Internal notes of a quote: a chat with author and version history. They never reach the PDF or the issued snapshot,
// so they are loaded here and not in getQuote().
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import type { Quote, QuoteNote } from "@/generated/prisma/client";
import type { CurrentUser } from "@/modules/auth/session";
import { authorLabel } from "@/modules/audit/service";
import { noteInput } from "./schema";
import { logQuote, quoteLabel, withDraft } from "./service";

export type NoteView = {
  id: string; text: string; authorId: string | null; authorName: string; updatedAt: Date; edited: boolean;
  /** Earlier texts, oldest first. */
  versions: { text: string; authorName: string; createdAt: Date }[];
};
/** One revision's notes, oldest first; only the current draft's are editable. */
export type NoteGroup = { quoteId: string; revision: number; issuedAt: Date | null; editable: boolean; notes: NoteView[] };

/** The notes of `quoteId` and of the revisions it comes from, R0 first. */
export async function listNotes(quoteId: string): Promise<NoteGroup[]> {
  const chain: Pick<Quote, "id" | "revision" | "issuedAt" | "status" | "parentId">[] = [];
  for (let id: string | null = quoteId; id; ) {
    const q: (typeof chain)[number] | null = await prisma.quote.findUnique({ where: { id }, select: { id: true, revision: true, issuedAt: true, status: true, parentId: true } });
    if (!q) throw new NotFoundError("El presupuesto no existe");
    chain.unshift(q);
    id = q.parentId;
  }
  const notes = await prisma.quoteNote.findMany({
    where: { quoteId: { in: chain.map((q) => q.id) } },
    include: { author: { select: { name: true } }, versions: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
  });
  return chain.map((q) => ({
    quoteId: q.id, revision: q.revision, issuedAt: q.issuedAt, editable: q.id === quoteId && q.status === "DRAFT",
    notes: notes.filter((n) => n.quoteId === q.id).map((n) => ({
      id: n.id, text: n.text, authorId: n.authorId, authorName: authorLabel(n.author, n.authorName) ?? "", updatedAt: n.updatedAt, edited: n.edited,
      versions: n.versions.map((v) => ({ text: v.text, authorName: authorLabel(v.author, v.authorName) ?? "", createdAt: v.createdAt })),
    })),
  }));
}

async function findNote(id: string): Promise<QuoteNote> {
  const n = await prisma.quoteNote.findUnique({ where: { id } });
  if (!n) throw new NotFoundError("La nota no existe");
  return n;
}

// Notes go through withDraft (issued quotes are locked) with a null actor: they do not change the quote's responsible.

export async function addNote(actor: CurrentUser, quoteId: string, raw: { text: string }): Promise<QuoteNote> {
  const { text } = parseOrThrow(noteInput, raw);
  return withDraft(null, quoteId, async (tx, quote) => {
    const note = await tx.quoteNote.create({ data: { quoteId, authorId: actor.id, text } });
    await logQuote(tx, actor, quoteId, "note.create", `Nota añadida a ${quoteLabel(quote)}`);
    return note;
  });
}

/** Whoever edits a note becomes its author, with the current date; the previous text is kept as a version. */
export async function editNote(actor: CurrentUser, noteId: string, raw: { text: string }): Promise<void> {
  const { text } = parseOrThrow(noteInput, raw);
  const found = await findNote(noteId);
  await withDraft(null, found.quoteId, async (tx, quote) => {
    const note = await tx.quoteNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundError("La nota no existe");
    if (note.text === text) return;
    await tx.quoteNoteVersion.create({ data: { noteId, authorId: note.authorId, authorName: note.authorName, text: note.text, createdAt: note.updatedAt } });
    await tx.quoteNote.update({ where: { id: noteId }, data: { authorId: actor.id, authorName: null, text, edited: true, updatedAt: new Date() } });
    await logQuote(tx, actor, quote.id, "note.update", `Nota editada en ${quoteLabel(quote)}`);
  });
}

export async function deleteNote(actor: CurrentUser, noteId: string): Promise<void> {
  const found = await findNote(noteId);
  await withDraft(null, found.quoteId, async (tx, quote) => {
    await tx.quoteNote.deleteMany({ where: { id: noteId } });
    await logQuote(tx, actor, quote.id, "note.delete", `Nota borrada de ${quoteLabel(quote)}`);
  });
}
