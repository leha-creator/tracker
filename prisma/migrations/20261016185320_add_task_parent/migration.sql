-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "parentId" UUID;

-- CreateIndex
CREATE INDEX "Task_workspaceId_parentId_idx" ON "Task"("workspaceId", "parentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_workspaceId_fkey" FOREIGN KEY ("parentId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Задача не может быть подзадачей самой себя (циклы длиннее проверяет models/task-tree).
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_not_self_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");
