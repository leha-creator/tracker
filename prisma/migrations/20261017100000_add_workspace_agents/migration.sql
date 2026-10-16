-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN     "issuedById" TEXT,
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY['read', 'tasks', 'documents']::TEXT[];

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "createdViaTokenId" UUID;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "createdViaTokenId" UUID;

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "createdViaTokenId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WorkspaceAgent" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceAgent_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "McpActivity" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenId" UUID,
    "tool" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "targetKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceAgent_workspaceId_idx" ON "WorkspaceAgent"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceAgent_responsibleUserId_idx" ON "WorkspaceAgent"("responsibleUserId");

-- CreateIndex
CREATE INDEX "WorkspaceAgent_createdById_idx" ON "WorkspaceAgent"("createdById");

-- CreateIndex
CREATE INDEX "McpActivity_workspaceId_userId_createdAt_idx" ON "McpActivity"("workspaceId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "McpActivity_tokenId_createdAt_idx" ON "McpActivity"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "McpActivity_createdAt_idx" ON "McpActivity"("createdAt");

-- CreateIndex
CREATE INDEX "ApiToken_issuedById_idx" ON "ApiToken"("issuedById");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdViaTokenId_fkey" FOREIGN KEY ("createdViaTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_createdViaTokenId_fkey" FOREIGN KEY ("createdViaTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdViaTokenId_fkey" FOREIGN KEY ("createdViaTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAgent" ADD CONSTRAINT "WorkspaceAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAgent" ADD CONSTRAINT "WorkspaceAgent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAgent" ADD CONSTRAINT "WorkspaceAgent_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAgent" ADD CONSTRAINT "WorkspaceAgent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpActivity" ADD CONSTRAINT "McpActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpActivity" ADD CONSTRAINT "McpActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpActivity" ADD CONSTRAINT "McpActivity_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Существующие токены — личные: выпустил сам владелец (области — все, по умолчанию колонки).
UPDATE "ApiToken" SET "issuedById" = "userId" WHERE "issuedById" IS NULL;
