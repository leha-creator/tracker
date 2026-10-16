-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('note', 'file');

-- CreateEnum
CREATE TYPE "DocumentFileStatus" AS ENUM ('pending', 'ready');

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "canManageDocuments" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DocumentFolder" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "folderId" UUID,
    "kind" "DocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "content" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fileName" TEXT,
    "extension" TEXT,
    "contentType" TEXT,
    "size" INTEGER,
    "storageKey" TEXT,
    "status" "DocumentFileStatus",
    "uploadedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTag" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTagAssignment" (
    "documentId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "DocumentTagAssignment_pkey" PRIMARY KEY ("documentId","tagId")
);

-- CreateTable
CREATE TABLE "TaskDocumentLink" (
    "taskId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDocumentLink_pkey" PRIMARY KEY ("taskId","documentId")
);

-- CreateIndex
CREATE INDEX "DocumentFolder_workspaceId_parentId_idx" ON "DocumentFolder"("workspaceId", "parentId");

-- CreateIndex
CREATE INDEX "DocumentFolder_createdById_idx" ON "DocumentFolder"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFolder_id_workspaceId_key" ON "DocumentFolder"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_workspaceId_folderId_titleKey_idx" ON "Document"("workspaceId", "folderId", "titleKey");

-- CreateIndex
CREATE INDEX "Document_workspaceId_updatedAt_idx" ON "Document"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "Document_workspaceId_kind_status_idx" ON "Document"("workspaceId", "kind", "status");

-- CreateIndex
CREATE INDEX "Document_createdById_status_createdAt_idx" ON "Document"("createdById", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Document_updatedById_idx" ON "Document"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "Document_id_workspaceId_key" ON "Document"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTag_workspaceId_nameKey_key" ON "DocumentTag"("workspaceId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTag_id_workspaceId_key" ON "DocumentTag"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "DocumentTagAssignment_tagId_idx" ON "DocumentTagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "TaskDocumentLink_documentId_idx" ON "TaskDocumentLink"("documentId");

-- CreateIndex
CREATE INDEX "TaskDocumentLink_createdById_idx" ON "TaskDocumentLink"("createdById");

-- AddForeignKey
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_parentId_workspaceId_fkey" FOREIGN KEY ("parentId", "workspaceId") REFERENCES "DocumentFolder"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_workspaceId_fkey" FOREIGN KEY ("folderId", "workspaceId") REFERENCES "DocumentFolder"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTagAssignment" ADD CONSTRAINT "DocumentTagAssignment_documentId_workspaceId_fkey" FOREIGN KEY ("documentId", "workspaceId") REFERENCES "Document"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTagAssignment" ADD CONSTRAINT "DocumentTagAssignment_tagId_workspaceId_fkey" FOREIGN KEY ("tagId", "workspaceId") REFERENCES "DocumentTag"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDocumentLink" ADD CONSTRAINT "TaskDocumentLink_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDocumentLink" ADD CONSTRAINT "TaskDocumentLink_documentId_workspaceId_fkey" FOREIGN KEY ("documentId", "workspaceId") REFERENCES "Document"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDocumentLink" ADD CONSTRAINT "TaskDocumentLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Вручную (Prisma так не умеет) ──────────────────────────────────────────────

-- Имя папки уникально в родителе без учёта регистра. У корневых папок parentId = null,
-- поэтому NULLS NOT DISTINCT (Postgres 15+): иначе в корне допускались бы дубликаты.
CREATE UNIQUE INDEX "DocumentFolder_workspaceId_parentId_nameKey_key"
  ON "DocumentFolder"("workspaceId", "parentId", "nameKey") NULLS NOT DISTINCT;

-- Папка не может быть родителем самой себя (циклы глубже проверяет модель documents).
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_not_self_parent"
  CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- Заметка: только content, без полей файла. Файл: поля файла заполнены, content — null.
ALTER TABLE "Document" ADD CONSTRAINT "Document_kind_fields_check" CHECK (
  ("kind" = 'note'
    AND "content" IS NOT NULL
    AND "fileName" IS NULL AND "extension" IS NULL AND "contentType" IS NULL
    AND "size" IS NULL AND "storageKey" IS NULL AND "status" IS NULL AND "uploadedAt" IS NULL)
  OR
  ("kind" = 'file'
    AND "content" IS NULL
    AND "fileName" IS NOT NULL AND "extension" IS NOT NULL AND "contentType" IS NOT NULL
    AND "size" IS NOT NULL AND "size" >= 0 AND "storageKey" IS NOT NULL AND "status" IS NOT NULL)
);
