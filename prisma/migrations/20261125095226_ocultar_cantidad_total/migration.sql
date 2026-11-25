-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "showQuantity" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "QuoteSection" ADD COLUMN     "showTotal" BOOLEAN NOT NULL DEFAULT true;
