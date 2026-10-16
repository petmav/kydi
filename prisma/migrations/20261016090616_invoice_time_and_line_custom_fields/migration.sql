-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoiceTime" TEXT;

-- AlterTable
ALTER TABLE "LineItem" ADD COLUMN     "customFields" JSONB;
