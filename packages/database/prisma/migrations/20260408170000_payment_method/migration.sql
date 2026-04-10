-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK', 'ROBLOX', 'PAYPAL');

-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN "paymentMethod" "PaymentMethod",
ADD COLUMN "paymentMethodDetail" TEXT;
