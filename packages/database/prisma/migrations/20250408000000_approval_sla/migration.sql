-- Tables already exist in initial schema
-- Only add enum type if not exists

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ApprovalStatus'
  ) THEN
    CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- Add thresholds array to Budget if not exists
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

-- Add foreign key to Budget leaderId if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'Budget'
      AND constraint_name = 'Budget_leaderId_fkey'
  ) THEN
    ALTER TABLE "Budget"
      ADD CONSTRAINT "Budget_leaderId_fkey"
      FOREIGN KEY ("leaderId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;