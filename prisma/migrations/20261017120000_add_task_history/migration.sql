-- CreateEnum
CREATE TYPE "TaskHistoryKind" AS ENUM ('created', 'title', 'description', 'priority', 'due_date', 'assignee', 'status', 'project_added', 'project_removed', 'parent', 'labels', 'archived', 'restored');

-- CreateTable
CREATE TABLE "TaskHistoryEntry" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" UUID NOT NULL,
    "kind" "TaskHistoryKind" NOT NULL,
    "actorId" TEXT,
    "viaTokenId" UUID,
    "source" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskHistoryEntry_taskId_createdAt_idx" ON "TaskHistoryEntry"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskHistoryEntry_workspaceId_idx" ON "TaskHistoryEntry"("workspaceId");

-- CreateIndex
CREATE INDEX "TaskHistoryEntry_actorId_idx" ON "TaskHistoryEntry"("actorId");

-- CreateIndex
CREATE INDEX "TaskHistoryEntry_viaTokenId_idx" ON "TaskHistoryEntry"("viaTokenId");

-- AddForeignKey
ALTER TABLE "TaskHistoryEntry" ADD CONSTRAINT "TaskHistoryEntry_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHistoryEntry" ADD CONSTRAINT "TaskHistoryEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHistoryEntry" ADD CONSTRAINT "TaskHistoryEntry_viaTokenId_fkey" FOREIGN KEY ("viaTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
