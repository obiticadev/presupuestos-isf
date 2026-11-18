-- Tipos de presupuesto (Bloque 7)
CREATE TABLE "QuoteType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "QuoteType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuoteType_code_key" ON "QuoteType"("code");

ALTER TABLE "Quote" ADD COLUMN "typeId" TEXT;
CREATE INDEX "Quote_typeId_idx" ON "Quote"("typeId");
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "QuoteType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
