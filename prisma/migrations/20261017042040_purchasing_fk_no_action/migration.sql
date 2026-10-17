-- DropForeignKey
ALTER TABLE "Bill" DROP CONSTRAINT "Bill_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "BillLine" DROP CONSTRAINT "BillLine_expenseCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "BillSettlement" DROP CONSTRAINT "BillSettlement_billId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringCost" DROP CONSTRAINT "RecurringCost_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPayment" DROP CONSTRAINT "SupplierPayment_refundOfCreditId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPayment" DROP CONSTRAINT "SupplierPayment_refundOfPaymentId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPayment" DROP CONSTRAINT "SupplierPayment_supplierId_fkey";

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_refundOfPaymentId_fkey" FOREIGN KEY ("refundOfPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_refundOfCreditId_fkey" FOREIGN KEY ("refundOfCreditId") REFERENCES "Bill"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSettlement" ADD CONSTRAINT "BillSettlement_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCost" ADD CONSTRAINT "RecurringCost_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
