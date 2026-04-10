-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('ROBUX', 'COP', 'USD');

-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN "currency" "CurrencyCode" NOT NULL DEFAULT 'COP';
