-- Referencia por tipo y ampliaciones (Bloque 7)
ALTER TABLE "Quote" ADD COLUMN "typeCode" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN "extension" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN "numberPattern" TEXT;

-- Lo ya numerado conserva el patrón con el que se numeró (sus revisiones salen con el mismo formato).
UPDATE "Quote" SET "numberPattern" = (SELECT "numberPattern" FROM "CompanySettings" WHERE "id" = 1) WHERE "seq" IS NOT NULL;

DROP INDEX "Quote_seqYear_seq_revision_key";
CREATE UNIQUE INDEX "Quote_seqYear_typeCode_seq_extension_revision_key" ON "Quote"("seqYear", "typeCode", "seq", "extension", "revision");

-- Patrón por defecto nuevo; uno personalizado se respeta.
ALTER TABLE "CompanySettings" ALTER COLUMN "numberPattern" SET DEFAULT 'PR-{AAAA}{TTT}{NNN}-R{RR}';
UPDATE "CompanySettings" SET "numberPattern" = 'PR-{AAAA}{TTT}{NNN}-R{RR}' WHERE "numberPattern" = 'PR-{AAAA}{NNNNNN}-R{RR}';
