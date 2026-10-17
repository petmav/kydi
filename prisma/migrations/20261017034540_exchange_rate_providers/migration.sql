-- CreateTable
CREATE TABLE "ExchangeRateProvider" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "driver" TEXT NOT NULL,
    "keyEncrypted" TEXT NOT NULL,
    "currencies" TEXT[],
    "driverConfig" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRateProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRateProvider_companyId_active_idx" ON "ExchangeRateProvider"("companyId", "active");

-- AddForeignKey
ALTER TABLE "ExchangeRateProvider" ADD CONSTRAINT "ExchangeRateProvider_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
