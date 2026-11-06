-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SectionMode" AS ENUM ('SUM', 'GLOBAL');

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "seqYear" INTEGER,
    "seq" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "clientId" TEXT NOT NULL,
    "locationId" TEXT,
    "contactId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "exclusions" TEXT NOT NULL DEFAULT '',
    "validityDays" INTEGER NOT NULL,
    "travelNote" TEXT NOT NULL DEFAULT '',
    "waivers" JSONB NOT NULL DEFAULT '{}',
    "parentId" TEXT,
    "supersededById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "base" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteSection" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "parentId" TEXT,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "mode" "SectionMode" NOT NULL DEFAULT 'SUM',
    "globalQty" DECIMAL(14,4),
    "globalPrice" DECIMAL(14,4),
    "taxName" TEXT,
    "taxRatePct" DECIMAL(5,2),

    CONSTRAINT "QuoteSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "conceptId" TEXT,
    "description" TEXT NOT NULL,
    "unitName" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(14,4),
    "taxName" TEXT,
    "taxRatePct" DECIMAL(5,2),
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequiredConcept" (
    "conceptId" TEXT NOT NULL,

    CONSTRAINT "RequiredConcept_pkey" PRIMARY KEY ("conceptId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_reference_key" ON "Quote"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_supersededById_key" ON "Quote"("supersededById");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_date_idx" ON "Quote"("date");

-- CreateIndex
CREATE INDEX "Quote_clientId_idx" ON "Quote"("clientId");

-- CreateIndex
CREATE INDEX "Quote_ownerId_idx" ON "Quote"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_seqYear_seq_revision_key" ON "Quote"("seqYear", "seq", "revision");

-- CreateIndex
CREATE INDEX "QuoteSection_quoteId_idx" ON "QuoteSection"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteSection_parentId_idx" ON "QuoteSection"("parentId");

-- CreateIndex
CREATE INDEX "QuoteLine_sectionId_idx" ON "QuoteLine"("sectionId");

-- CreateIndex
CREATE INDEX "QuoteLine_conceptId_idx" ON "QuoteLine"("conceptId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClientLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSection" ADD CONSTRAINT "QuoteSection_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSection" ADD CONSTRAINT "QuoteSection_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuoteSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "QuoteSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequiredConcept" ADD CONSTRAINT "RequiredConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Semilla: conceptos obligatorios de la spec 5.5 (desplazamiento y horas de programador). Debe coincidir con seedDefaults().
INSERT INTO "RequiredConcept" ("conceptId") VALUES ('concept-ser-despl'), ('concept-ser-prog');
