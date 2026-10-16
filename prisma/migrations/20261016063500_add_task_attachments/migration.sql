-- CreateEnum
CREATE TYPE "AttachmentTarget" AS ENUM ('task', 'comment');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('pending', 'ready');

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" UUID NOT NULL,
    "target" "AttachmentTarget" NOT NULL,
    "commentId" UUID,
    "uploaderId" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_storageKey_key" ON "TaskAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_target_status_createdAt_idx" ON "TaskAttachment"("taskId", "target", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TaskAttachment_commentId_idx" ON "TaskAttachment"("commentId");

-- CreateIndex
CREATE INDEX "TaskAttachment_uploaderId_status_createdAt_idx" ON "TaskAttachment"("uploaderId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TaskAttachment_workspaceId_idx" ON "TaskAttachment"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskComment_id_taskId_key" ON "TaskComment"("id", "taskId");

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_commentId_taskId_fkey" FOREIGN KEY ("commentId", "taskId") REFERENCES "TaskComment"("id", "taskId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Вложение блока задачи не может ссылаться на комментарий (Prisma не описывает CHECK).
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_target_comment_check" CHECK ("target" = 'comment' OR "commentId" IS NULL);
