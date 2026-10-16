-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaxCalculation" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "TaxTransaction" AS ENUM ('SALES', 'PURCHASES');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaidStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'EXPIRED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LimitBy" AS ENUM ('NONE', 'COUNT', 'DATE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "lastCompanyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "uniqueHash" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "vatId" TEXT,
    "taxId" TEXT,
    "logoPath" TEXT,
    "addrName" TEXT,
    "street1" TEXT,
    "street2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySetting" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abilities" TEXT[],
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyUser" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "contactName" TEXT,
    "companyName" TEXT,
    "website" TEXT,
    "prefix" TEXT,
    "taxId" TEXT,
    "currency" TEXT NOT NULL,
    "enablePortal" BOOLEAN NOT NULL DEFAULT false,
    "portalPasswordHash" TEXT,
    "billingName" TEXT,
    "billingStreet1" TEXT,
    "billingStreet2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingCountry" TEXT,
    "billingZip" TEXT,
    "billingPhone" TEXT,
    "shippingName" TEXT,
    "shippingStreet1" TEXT,
    "shippingStreet2" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingCountry" TEXT,
    "shippingZip" TEXT,
    "shippingPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalResetToken" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" BIGINT NOT NULL,
    "unitId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemTax" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "taxTypeId" INTEGER NOT NULL,

    CONSTRAINT "ItemTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxType" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "calculationType" "TaxCalculation" NOT NULL DEFAULT 'PERCENTAGE',
    "percent" DOUBLE PRECISION,
    "fixedAmount" BIGINT,
    "compound" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "transactionType" "TaxTransaction" NOT NULL DEFAULT 'SALES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'INVOICE',
    "invoiceNumber" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "customerSequenceNumber" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "currency" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paidStatus" "PaidStatus" NOT NULL DEFAULT 'UNPAID',
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "viewed" BOOLEAN NOT NULL DEFAULT false,
    "taxPerItem" BOOLEAN NOT NULL DEFAULT false,
    "discountPerItem" BOOLEAN NOT NULL DEFAULT false,
    "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
    "discountType" "DiscountType" NOT NULL DEFAULT 'FIXED',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountVal" BIGINT NOT NULL DEFAULT 0,
    "subTotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "dueAmount" BIGINT NOT NULL DEFAULT 0,
    "baseSubTotal" BIGINT NOT NULL DEFAULT 0,
    "baseDiscountVal" BIGINT NOT NULL DEFAULT 0,
    "baseTax" BIGINT NOT NULL DEFAULT 0,
    "baseTotal" BIGINT NOT NULL DEFAULT 0,
    "baseDueAmount" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "templateName" TEXT NOT NULL DEFAULT 'invoice1',
    "recurringInvoiceId" INTEGER,
    "relatedInvoiceId" INTEGER,
    "creditReason" TEXT,
    "uniqueHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "customerSequenceNumber" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "estimateDate" DATE NOT NULL,
    "expiryDate" DATE,
    "currency" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "taxPerItem" BOOLEAN NOT NULL DEFAULT false,
    "discountPerItem" BOOLEAN NOT NULL DEFAULT false,
    "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
    "discountType" "DiscountType" NOT NULL DEFAULT 'FIXED',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountVal" BIGINT NOT NULL DEFAULT 0,
    "subTotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "baseSubTotal" BIGINT NOT NULL DEFAULT 0,
    "baseDiscountVal" BIGINT NOT NULL DEFAULT 0,
    "baseTax" BIGINT NOT NULL DEFAULT 0,
    "baseTotal" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "templateName" TEXT NOT NULL DEFAULT 'estimate1',
    "uniqueHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringInvoice" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL,
    "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextInvoiceAt" TIMESTAMP(3),
    "limitBy" "LimitBy" NOT NULL DEFAULT 'NONE',
    "limitCount" INTEGER,
    "limitDate" DATE,
    "sendAutomatically" BOOLEAN NOT NULL DEFAULT false,
    "notifyCreator" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "taxPerItem" BOOLEAN NOT NULL DEFAULT false,
    "discountPerItem" BOOLEAN NOT NULL DEFAULT false,
    "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
    "discountType" "DiscountType" NOT NULL DEFAULT 'FIXED',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountVal" BIGINT NOT NULL DEFAULT 0,
    "subTotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "templateName" TEXT NOT NULL DEFAULT 'invoice1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringRun" (
    "id" SERIAL NOT NULL,
    "recurringInvoiceId" INTEGER NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "invoiceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "estimateId" INTEGER,
    "recurringInvoiceId" INTEGER,
    "itemId" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitName" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" BIGINT NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'FIXED',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountVal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "basePrice" BIGINT NOT NULL DEFAULT 0,
    "baseDiscountVal" BIGINT NOT NULL DEFAULT 0,
    "baseTax" BIGINT NOT NULL DEFAULT 0,
    "baseTotal" BIGINT NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sourceLineId" INTEGER,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppliedTax" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "taxTypeId" INTEGER,
    "name" TEXT NOT NULL,
    "calculationType" "TaxCalculation" NOT NULL,
    "percent" DOUBLE PRECISION,
    "fixedAmount" BIGINT,
    "compound" BOOLEAN NOT NULL DEFAULT false,
    "amount" BIGINT NOT NULL,
    "baseAmount" BIGINT NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "invoiceId" INTEGER,
    "estimateId" INTEGER,
    "recurringInvoiceId" INTEGER,
    "lineItemId" INTEGER,

    CONSTRAINT "AppliedTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "customerSequenceNumber" INTEGER NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "baseAmount" BIGINT NOT NULL,
    "paymentMethodId" INTEGER,
    "notes" TEXT,
    "uniqueHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "baseAmount" BIGINT NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "creatorId" INTEGER,
    "expenseDate" DATE NOT NULL,
    "expenseNumber" TEXT,
    "categoryId" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "baseAmount" BIGINT NOT NULL,
    "paymentMethodId" INTEGER,
    "customerId" INTEGER,
    "notes" TEXT,
    "receiptPath" TEXT,
    "receiptName" TEXT,
    "receiptMime" TEXT,
    "receiptSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseTax" (
    "id" SERIAL NOT NULL,
    "expenseId" INTEGER NOT NULL,
    "taxTypeId" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "ExpenseTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "placeholder" TEXT,
    "options" TEXT[],
    "defaultAnswer" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "placement" TEXT NOT NULL DEFAULT 'internal',
    "validation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customFieldId" INTEGER NOT NULL,
    "modelType" TEXT NOT NULL,
    "modelId" INTEGER NOT NULL,
    "value" TEXT,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRateLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "bcc" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mailableType" TEXT NOT NULL,
    "mailableId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobState" (
    "key" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_uniqueHash_key" ON "Company"("uniqueHash");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySetting_companyId_key_key" ON "CompanySetting"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_name_key" ON "Role"("companyId", "name");

-- CreateIndex
CREATE INDEX "CompanyUser_userId_idx" ON "CompanyUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUser_companyId_userId_key" ON "CompanyUser"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_companyId_email_idx" ON "Invitation"("companyId", "email");

-- CreateIndex
CREATE INDEX "Customer_companyId_name_idx" ON "Customer"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_email_key" ON "Customer"("companyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PortalResetToken_tokenHash_key" ON "PortalResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_companyId_name_key" ON "Unit"("companyId", "name");

-- CreateIndex
CREATE INDEX "Item_companyId_name_idx" ON "Item"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ItemTax_itemId_taxTypeId_key" ON "ItemTax"("itemId", "taxTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxType_companyId_name_key" ON "TaxType"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_uniqueHash_key" ON "Invoice"("uniqueHash");

-- CreateIndex
CREATE INDEX "Invoice_companyId_type_status_idx" ON "Invoice"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_invoiceNumber_key" ON "Invoice"("companyId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_uniqueHash_key" ON "Estimate"("uniqueHash");

-- CreateIndex
CREATE INDEX "Estimate_companyId_status_idx" ON "Estimate"("companyId", "status");

-- CreateIndex
CREATE INDEX "Estimate_customerId_idx" ON "Estimate"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_companyId_estimateNumber_key" ON "Estimate"("companyId", "estimateNumber");

-- CreateIndex
CREATE INDEX "RecurringInvoice_status_nextInvoiceAt_idx" ON "RecurringInvoice"("status", "nextInvoiceAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringRun_recurringInvoiceId_scheduledAt_key" ON "RecurringRun"("recurringInvoiceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "LineItem_invoiceId_idx" ON "LineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "LineItem_estimateId_idx" ON "LineItem"("estimateId");

-- CreateIndex
CREATE INDEX "LineItem_recurringInvoiceId_idx" ON "LineItem"("recurringInvoiceId");

-- CreateIndex
CREATE INDEX "AppliedTax_invoiceId_idx" ON "AppliedTax"("invoiceId");

-- CreateIndex
CREATE INDEX "AppliedTax_estimateId_idx" ON "AppliedTax"("estimateId");

-- CreateIndex
CREATE INDEX "AppliedTax_lineItemId_idx" ON "AppliedTax"("lineItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_companyId_name_key" ON "PaymentMethod"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_uniqueHash_key" ON "Payment"("uniqueHash");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_paymentNumber_key" ON "Payment"("companyId", "paymentNumber");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "Expense_companyId_expenseDate_idx" ON "Expense"("companyId", "expenseDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseTax_expenseId_taxTypeId_key" ON "ExpenseTax"("expenseId", "taxTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_companyId_slug_key" ON "CustomField"("companyId", "slug");

-- CreateIndex
CREATE INDEX "CustomFieldValue_modelType_modelId_idx" ON "CustomFieldValue"("modelType", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_customFieldId_modelType_modelId_key" ON "CustomFieldValue"("customFieldId", "modelType", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_companyId_type_name_key" ON "Note"("companyId", "type", "name");

-- CreateIndex
CREATE INDEX "ExchangeRateLog_companyId_currency_idx" ON "ExchangeRateLog"("companyId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_token_key" ON "EmailLog"("token");

-- CreateIndex
CREATE INDEX "EmailLog_mailableType_mailableId_idx" ON "EmailLog"("mailableType", "mailableId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySetting" ADD CONSTRAINT "CompanySetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTax" ADD CONSTRAINT "ItemTax_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTax" ADD CONSTRAINT "ItemTax_taxTypeId_fkey" FOREIGN KEY ("taxTypeId") REFERENCES "TaxType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxType" ADD CONSTRAINT "TaxType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRun" ADD CONSTRAINT "RecurringRun_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedTax" ADD CONSTRAINT "AppliedTax_taxTypeId_fkey" FOREIGN KEY ("taxTypeId") REFERENCES "TaxType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedTax" ADD CONSTRAINT "AppliedTax_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedTax" ADD CONSTRAINT "AppliedTax_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedTax" ADD CONSTRAINT "AppliedTax_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedTax" ADD CONSTRAINT "AppliedTax_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTax" ADD CONSTRAINT "ExpenseTax_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTax" ADD CONSTRAINT "ExpenseTax_taxTypeId_fkey" FOREIGN KEY ("taxTypeId") REFERENCES "TaxType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRateLog" ADD CONSTRAINT "ExchangeRateLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
