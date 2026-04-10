DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus'
  ) THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'Role'
  ) THEN
    CREATE TYPE "Role" AS ENUM ('LIDER', 'HOLDER', 'ADMIN', 'CAJERO');
  END IF;
END $$;

-- Fix User role column to use enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User'
      AND column_name = 'role'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
    ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'LIDER'::"Role";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ApprovalStatus'
  ) THEN
    CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ApprovalRule'
      AND column_name = 'approverRoles'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "ApprovalRule" ALTER COLUMN "approverRoles" TYPE TEXT[] USING "approverRoles"::text[];
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'PaymentApproval'
      AND column_name = 'status'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE "PaymentApproval" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "PaymentApproval"
      ALTER COLUMN "status" TYPE "ApprovalStatus"
      USING "status"::"ApprovalStatus";
    ALTER TABLE "PaymentApproval" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"ApprovalStatus";
  END IF;
END $$;