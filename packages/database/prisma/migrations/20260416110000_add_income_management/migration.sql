-- CreateEnum
CREATE TYPE "IncomeCustomerType" AS ENUM ('CLIENTE', 'DESTACADO', 'RICACHON');

-- CreateEnum
CREATE TYPE "IncomePaymentMethod" AS ENUM ('NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'PAYPAL', 'OTRO');

-- CreateTable
CREATE TABLE "IncomeRecord" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customerType" "IncomeCustomerType" NOT NULL,
    "paymentMethod" "IncomePaymentMethod" NOT NULL,
    "paymentMethodOther" TEXT,
    "digitalService" TEXT NOT NULL,
    "soldAmount" DECIMAL(12,2) NOT NULL,
    "receivedAmount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "IncomeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeRecord_date_idx" ON "IncomeRecord"("date");

-- CreateIndex
CREATE INDEX "IncomeRecord_customerType_idx" ON "IncomeRecord"("customerType");

-- CreateIndex
CREATE INDEX "IncomeRecord_paymentMethod_idx" ON "IncomeRecord"("paymentMethod");

-- CreateIndex
CREATE INDEX "IncomeRecord_digitalService_idx" ON "IncomeRecord"("digitalService");

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
