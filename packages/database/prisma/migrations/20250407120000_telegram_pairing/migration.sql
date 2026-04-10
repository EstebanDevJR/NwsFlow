-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramPairingAllowed" BOOLEAN NOT NULL DEFAULT false;

-- Habilitar vinculación a holders existentes (rangos / holders ya operativos)
UPDATE "User" SET "telegramPairingAllowed" = true WHERE "role" = 'HOLDER';
