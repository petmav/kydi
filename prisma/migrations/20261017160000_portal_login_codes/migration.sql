-- CreateTable
CREATE TABLE "PortalLoginCode" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalLoginCode_customerId_idx" ON "PortalLoginCode"("customerId");

-- AddForeignKey
ALTER TABLE "PortalLoginCode" ADD CONSTRAINT "PortalLoginCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

