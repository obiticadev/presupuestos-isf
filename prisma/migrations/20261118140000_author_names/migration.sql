-- Bloque 6: a user can be deleted; what they wrote keeps their name, copied at deletion time.
ALTER TABLE "AuditLog" ADD COLUMN "userName" TEXT;
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PriceAdjustment" ADD COLUMN "userName" TEXT;
ALTER TABLE "PriceAdjustment" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "PriceAdjustment" DROP CONSTRAINT "PriceAdjustment_userId_fkey";
ALTER TABLE "PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteNote" ADD COLUMN "authorName" TEXT;
ALTER TABLE "QuoteNote" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "QuoteNote" DROP CONSTRAINT "QuoteNote_authorId_fkey";
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteNoteVersion" ADD COLUMN "authorName" TEXT;
ALTER TABLE "QuoteNoteVersion" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "QuoteNoteVersion" DROP CONSTRAINT "QuoteNoteVersion_authorId_fkey";
ALTER TABLE "QuoteNoteVersion" ADD CONSTRAINT "QuoteNoteVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
