-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('none', 'low', 'medium', 'high', 'urgent');

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'none',
    "dueDate" DATE,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPlacement" (
    "taskId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "statusId" UUID NOT NULL,
    -- Вручную: дробные ключи fractional-indexing сравниваются побайтно.
    "position" TEXT COLLATE "C" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskPlacement_pkey" PRIMARY KEY ("taskId","projectId")
);

-- CreateTable
CREATE TABLE "WorkspaceTaskCounter" (
    "workspaceId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkspaceTaskCounter_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateIndex
CREATE INDEX "Task_workspaceId_createdAt_idx" ON "Task"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_assigneeId_idx" ON "Task"("workspaceId", "assigneeId");

-- CreateIndex
CREATE INDEX "Task_workspaceId_dueDate_idx" ON "Task"("workspaceId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Task_workspaceId_number_key" ON "Task"("workspaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_workspaceId_key" ON "Task"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "TaskPlacement_projectId_statusId_position_idx" ON "TaskPlacement"("projectId", "statusId", "position");

-- CreateIndex
CREATE INDEX "TaskPlacement_workspaceId_idx" ON "TaskPlacement"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStatus_id_projectId_key" ON "ProjectStatus"("id", "projectId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPlacement" ADD CONSTRAINT "TaskPlacement_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPlacement" ADD CONSTRAINT "TaskPlacement_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPlacement" ADD CONSTRAINT "TaskPlacement_statusId_projectId_fkey" FOREIGN KEY ("statusId", "projectId") REFERENCES "ProjectStatus"("id", "projectId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTaskCounter" ADD CONSTRAINT "WorkspaceTaskCounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Вручную: участник удаляется плагином Better Auth вне транзакций приложения, поэтому
-- снятие его с задач пространства выполняет БД.
CREATE FUNCTION "task_unassign_removed_member"() RETURNS trigger AS $$
BEGIN
    UPDATE "Task"
    SET "assigneeId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = OLD."workspaceId" AND "assigneeId" = OLD."userId";
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkspaceMember_unassign_tasks"
AFTER DELETE ON "WorkspaceMember"
FOR EACH ROW EXECUTE FUNCTION "task_unassign_removed_member"();
