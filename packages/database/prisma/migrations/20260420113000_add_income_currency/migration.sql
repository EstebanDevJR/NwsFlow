-- Add currency for income records; backfill existing rows as COP.
ALTER TABLE "IncomeRecord"
ADD COLUMN "currency" "CurrencyCode" NOT NULL DEFAULT 'COP';
