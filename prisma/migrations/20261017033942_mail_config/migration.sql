-- CreateTable
CREATE TABLE "MailConfig" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "driver" TEXT NOT NULL,
    "fromAddress" TEXT,
    "fromName" TEXT,
    "options" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailConfig_companyId_key" ON "MailConfig"("companyId");

-- AddForeignKey
ALTER TABLE "MailConfig" ADD CONSTRAINT "MailConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
