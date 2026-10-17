-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('BILL', 'SUPPLIER_CREDIT');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'OPEN', 'VOID');

-- CreateEnum
CREATE TYPE "SupplierPaymentType" AS ENUM ('PAYMENT', 'REFUND');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "supplierId" INTEGER;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "taxId" TEXT,
    "currency" TEXT NOT NULL,
    "expenseCategoryId" INTEGER,
    "paymentTerms" INTEGER NOT NULL DEFAULT 30,
    "street1" TEXT,
    "street2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "supplierId" INTEGER NOT NULL,
    "type" "BillType" NOT NULL DEFAULT 'BILL',
    "number" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "reference" TEXT,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "documentDate" DATE NOT NULL,
    "dueDate" DATE,
    "currency" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
    "subTotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "baseTotal" BIGINT NOT NULL DEFAULT 0,
    "dueAmount" BIGINT NOT NULL DEFAULT 0,
    "baseDueAmount" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "financialLockedAt" TIMESTAMP(3),
    "supplierSnapshot" JSONB NOT NULL DEFAULT '{}',
    "sourceBillId" INTEGER,
    "sourceExpenseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLine" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "expenseCategoryId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" BIGINT NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subTotal" BIGINT NOT NULL,
    "discountVal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "baseTotal" BIGINT NOT NULL DEFAULT 0,
    "sourceBillLineId" INTEGER,

    CONSTRAINT "BillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLineTax" (
    "id" SERIAL NOT NULL,
    "billLineId" INTEGER NOT NULL,
    "taxTypeId" INTEGER,
    "name" TEXT NOT NULL,
    "calculationType" "TaxCalculation" NOT NULL,
    "percent" DOUBLE PRECISION,
    "fixedAmount" BIGINT,
    "compound" BOOLEAN NOT NULL DEFAULT false,
    "amount" BIGINT NOT NULL,
    "baseAmount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "BillLineTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "supplierId" INTEGER NOT NULL,
    "type" "SupplierPaymentType" NOT NULL DEFAULT 'PAYMENT',
    "number" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "paymentDate" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "baseAmount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "paymentMethodId" INTEGER,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "refundOfPaymentId" INTEGER,
    "refundOfCreditId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillSettlement" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "supplierPaymentId" INTEGER,
    "creditId" INTEGER,
    "amount" BIGINT NOT NULL,
    "baseAmount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringCost" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "supplierId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'BILL',
    "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "frequency" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "limitBy" "LimitBy" NOT NULL DEFAULT 'NONE',
    "limitCount" INTEGER,
    "limitDate" DATE,
    "dueDays" INTEGER NOT NULL DEFAULT 30,
    "createAsDraft" BOOLEAN NOT NULL DEFAULT false,
    "notifyCreator" BOOLEAN NOT NULL DEFAULT false,
    "template" JSONB NOT NULL,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_companyId_name_idx" ON "Supplier"("companyId", "name");

-- CreateIndex
CREATE INDEX "Bill_companyId_type_status_idx" ON "Bill"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX "Bill_supplierId_idx" ON "Bill"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_companyId_type_number_key" ON "Bill"("companyId", "type", "number");

-- CreateIndex
CREATE INDEX "BillLine_billId_idx" ON "BillLine"("billId");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_companyId_type_number_key" ON "SupplierPayment"("companyId", "type", "number");

-- CreateIndex
CREATE INDEX "BillSettlement_supplierPaymentId_idx" ON "BillSettlement"("supplierPaymentId");

-- CreateIndex
CREATE INDEX "BillSettlement_creditId_idx" ON "BillSettlement"("creditId");

-- CreateIndex
CREATE UNIQUE INDEX "BillSettlement_billId_supplierPaymentId_key" ON "BillSettlement"("billId", "supplierPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillSettlement_billId_creditId_key" ON "BillSettlement"("billId", "creditId");

-- CreateIndex
CREATE INDEX "RecurringCost_status_nextRunAt_idx" ON "RecurringCost"("status", "nextRunAt");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_sourceBillId_fkey" FOREIGN KEY ("sourceBillId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLineTax" ADD CONSTRAINT "BillLineTax_billLineId_fkey" FOREIGN KEY ("billLineId") REFERENCES "BillLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_refundOfPaymentId_fkey" FOREIGN KEY ("refundOfPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_refundOfCreditId_fkey" FOREIGN KEY ("refundOfCreditId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSettlement" ADD CONSTRAINT "BillSettlement_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSettlement" ADD CONSTRAINT "BillSettlement_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSettlement" ADD CONSTRAINT "BillSettlement_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCost" ADD CONSTRAINT "RecurringCost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCost" ADD CONSTRAINT "RecurringCost_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grant the purchasing abilities to existing preset roles (spec §3.4 presets).
UPDATE "Role" SET "abilities" = ARRAY(SELECT DISTINCT unnest("abilities" || ARRAY['view-supplier', 'create-supplier', 'edit-supplier', 'delete-supplier', 'view-bill', 'create-bill', 'edit-bill', 'delete-bill', 'view-supplier-payment', 'create-supplier-payment', 'edit-supplier-payment', 'delete-supplier-payment', 'view-supplier-credit', 'create-supplier-credit', 'edit-supplier-credit', 'delete-supplier-credit', 'view-supplier-refund', 'create-supplier-refund', 'edit-supplier-refund', 'delete-supplier-refund', 'view-recurring-cost', 'create-recurring-cost', 'edit-recurring-cost', 'delete-recurring-cost']::TEXT[])) WHERE "name" = 'manager' AND NOT "isOwner";
UPDATE "Role" SET "abilities" = ARRAY(SELECT DISTINCT unnest("abilities" || ARRAY['view-supplier', 'view-bill', 'view-supplier-payment', 'view-supplier-credit', 'view-supplier-refund', 'view-recurring-cost']::TEXT[])) WHERE "name" = 'read-only' AND NOT "isOwner";
