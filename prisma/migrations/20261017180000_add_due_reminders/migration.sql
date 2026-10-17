-- CreateEnum
CREATE TYPE "TaskReminderKind" AS ENUM ('due_soon', 'overdue');

-- AlterEnum
-- Напоминания о сроке: значения enum добавляются в конец (PostgreSQL 17 допускает несколько ADD VALUE).

ALTER TYPE "NotificationType" ADD VALUE 'task_due_soon';
ALTER TYPE "NotificationType" ADD VALUE 'task_overdue';

-- CreateTable
CREATE TABLE "TaskDueReminder" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" UUID NOT NULL,
    "kind" "TaskReminderKind" NOT NULL,
    "dueDate" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDueReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskDueReminder_workspaceId_idx" ON "TaskDueReminder"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDueReminder_taskId_kind_dueDate_key" ON "TaskDueReminder"("taskId", "kind", "dueDate");

-- AddForeignKey
ALTER TABLE "TaskDueReminder" ADD CONSTRAINT "TaskDueReminder_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
