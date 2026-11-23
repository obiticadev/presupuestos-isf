import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { issueQuote } from "@/modules/quotes/issue";
import { createRevision } from "@/modules/quotes/lifecycle";
import { addNote } from "@/modules/quotes/notes";
import { deleteAllQuotes } from "@/modules/quotes/reset";
import { updateSettings } from "@/modules/settings/service";
import { completeDraft, makeDraft } from "../helpers/quotes";

// Never the real DATA_DIR: the reset deletes its pdf folder.
const realDataDir = process.env.DATA_DIR;
beforeAll(async () => { process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "reset-")); });
afterAll(async () => { await rm(process.env.DATA_DIR!, { recursive: true, force: true }); process.env.DATA_DIR = realDataDir; });

test("borra todos los presupuestos, sus PDF, notas, historial y contadores; la numeración vuelve a empezar", async () => {
  const { actor, admin, quote } = await completeDraft();
  await issueQuote(actor, quote.id);
  const rev = await createRevision(admin, quote.id);
  await issueQuote(admin, rev.id); // the original now has supersededById
  const draft = await makeDraft();
  await addNote(draft.actor, draft.quote.id, { text: "nota" });
  const pdf = path.join(process.env.DATA_DIR!, "pdf", "2026", "x.pdf");
  await mkdir(path.dirname(pdf), { recursive: true });
  await writeFile(pdf, "x");
  await prisma.auditLog.create({ data: { entity: "concept", entityId: "c", action: "update", summary: "se queda" } });

  expect(await deleteAllQuotes(admin, "BORRAR")).toBe(3);

  expect(await Promise.all([prisma.quote.count(), prisma.issuedDocument.count(), prisma.quoteNote.count(), prisma.numberCounter.count()]))
    .toEqual([0, 0, 0, 0]);
  const logs = await prisma.auditLog.findMany({ where: { entity: "quote" } });
  expect(logs.map((l) => [l.entityId, l.action, l.summary, l.userId])).toEqual([["all", "delete", "Borrados todos los presupuestos (3)", admin.id]]);
  expect(await prisma.auditLog.count({ where: { entity: "concept", summary: "se queda" } })).toBe(1);
  await expect(stat(path.join(process.env.DATA_DIR!, "pdf"))).rejects.toThrow();

  await updateSettings(admin, { numberStart: "7" });
  const next = await completeDraft();
  expect((await issueQuote(next.actor, next.quote.id)).seq).toBe(7);
});

test("sin escribir BORRAR exactamente, o siendo presupuestador, no borra nada", async () => {
  const { actor, admin } = await makeDraft();
  await expect(deleteAllQuotes(admin, "borrar")).rejects.toThrow(ValidationError);
  await expect(deleteAllQuotes(admin, "")).rejects.toThrow(ValidationError);
  await expect(deleteAllQuotes(actor, "BORRAR")).rejects.toThrow(ForbiddenError);
  expect(await prisma.quote.count()).toBe(1);
});
