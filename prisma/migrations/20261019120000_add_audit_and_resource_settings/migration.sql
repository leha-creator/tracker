-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('security', 'workspace', 'content', 'admin');

-- CreateEnum
CREATE TYPE "SignupMode" AS ENUM ('open', 'invite_only', 'closed');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "storageQuotaMb" INTEGER;

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "impersonatorId" TEXT,
    "viaTokenId" UUID,
    "targetUserId" TEXT,
    "workspaceId" TEXT,
    "data" JSONB NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "signupMode" "SignupMode" NOT NULL DEFAULT 'open',
    "allowedEmailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultWorkspaceQuotaMb" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ResourceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetUserId_createdAt_idx" ON "AuditEvent"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_actorId_createdAt_idx" ON "AuditEvent"("workspaceId", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_category_createdAt_idx" ON "AuditEvent"("category", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_impersonatorId_idx" ON "AuditEvent"("impersonatorId");

-- CreateIndex
CREATE INDEX "AuditEvent_viaTokenId_idx" ON "AuditEvent"("viaTokenId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_impersonatorId_fkey" FOREIGN KEY ("impersonatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_viaTokenId_fkey" FOREIGN KEY ("viaTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceSettings" ADD CONSTRAINT "ResourceSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

