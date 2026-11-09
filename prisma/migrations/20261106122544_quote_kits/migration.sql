-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "kitInstanceId" TEXT,
ADD COLUMN     "kitSlot" TEXT;

-- CreateTable
CREATE TABLE "KitInstance" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "choices" JSONB NOT NULL DEFAULT '{}',
    "missing" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL,

    CONSTRAINT "KitInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAdjustment" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "originalPrice" DECIMAL(14,4) NOT NULL,
    "newPrice" DECIMAL(14,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KitInstance_sectionId_idx" ON "KitInstance"("sectionId");

-- CreateIndex
CREATE INDEX "PriceAdjustment_lineId_idx" ON "PriceAdjustment"("lineId");

-- CreateIndex
CREATE INDEX "QuoteLine_kitInstanceId_idx" ON "QuoteLine"("kitInstanceId");

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_kitInstanceId_fkey" FOREIGN KEY ("kitInstanceId") REFERENCES "KitInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitInstance" ADD CONSTRAINT "KitInstance_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "QuoteSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitInstance" ADD CONSTRAINT "KitInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "QuoteLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
