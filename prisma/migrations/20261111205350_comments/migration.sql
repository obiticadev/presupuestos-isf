-- AlterTable
ALTER TABLE "KitInstance" ADD COLUMN     "comment" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "comment" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "QuoteSection" ADD COLUMN     "comment" TEXT NOT NULL DEFAULT '';
