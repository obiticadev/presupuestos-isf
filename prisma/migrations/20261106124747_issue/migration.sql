-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "numberPattern" TEXT NOT NULL DEFAULT 'PR-{AAAA}{NNNNNN}-R{RR}',
ADD COLUMN     "numberStart" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "numberYearlyReset" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NumberCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "NumberCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IssuedDocument" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "pdfPath" TEXT,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssuedDocument_quoteId_key" ON "IssuedDocument"("quoteId");

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
