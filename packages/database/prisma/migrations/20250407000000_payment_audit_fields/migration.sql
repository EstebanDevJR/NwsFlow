-- Payment audit columns already exist in initial schema
-- PaymentTimeline, Budget, BudgetAlert tables already exist in initial schema

-- Add thresholds array to Budget (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Budget'
      AND column_name = 'thresholds'
  ) THEN
    ALTER TABLE "Budget" ADD COLUMN "thresholds" INTEGER[] DEFAULT ARRAY[70, 90, 100];
  END IF;
END $$;