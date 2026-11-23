-- CreateTable
CREATE TABLE "QuoteNote" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteNoteVersion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteNoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteNote_quoteId_idx" ON "QuoteNote"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteNoteVersion_noteId_idx" ON "QuoteNoteVersion"("noteId");

-- AddForeignKey
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteNoteVersion" ADD CONSTRAINT "QuoteNoteVersion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "QuoteNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteNoteVersion" ADD CONSTRAINT "QuoteNoteVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La «Nota sobre el desglose» de cada presupuesto pasa a ser su primera nota, a nombre de su responsable.
INSERT INTO "QuoteNote" ("id", "quoteId", "authorId", "text", "edited", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "ownerId", btrim("travelNote"), false, "updatedAt", "updatedAt"
FROM "Quote" WHERE btrim("travelNote") <> '';

-- AlterTable
ALTER TABLE "Quote" DROP COLUMN "travelNote";
