-- Вход — только через IdP plwedding ID: пароли, подтверждение email, 2FA и политика регистрации
-- живут в IdP, фото профиля приходит из него же.

-- Локальные пароли больше не используются.
DELETE FROM "Account" WHERE "providerId" = 'credential';

-- Загруженные в tasker фото: адрес /api/users/<id>/avatar больше не обслуживается. Агенту —
-- статичный робот, остальным фото придёт из IdP при следующем входе.
UPDATE "User" SET "image" = '/agent-avatar.svg' WHERE "isAgent" = true;
UPDATE "User" SET "image" = NULL WHERE "isAgent" = false AND "image" LIKE '/api/users/%';

-- DropForeignKey
ALTER TABLE "TwoFactor" DROP CONSTRAINT "TwoFactor_userId_fkey";

-- DropIndex
DROP INDEX "UserProfile_avatarKey_key";

-- AlterTable
ALTER TABLE "ResourceSettings" DROP COLUMN "allowedEmailDomains",
DROP COLUMN "signupMode";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "twoFactorEnabled";

-- AlterTable
ALTER TABLE "UserProfile" DROP COLUMN "avatarKey";

-- DropTable
DROP TABLE "TwoFactor";

-- DropEnum
DROP TYPE "SignupMode";

