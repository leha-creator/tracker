-- CreateTable
CREATE TABLE "TaskLabel" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLabelAssignment" (
    "taskId" UUID NOT NULL,
    "labelId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "TaskLabelAssignment_pkey" PRIMARY KEY ("taskId","labelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskLabel_workspaceId_nameKey_key" ON "TaskLabel"("workspaceId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLabel_id_workspaceId_key" ON "TaskLabel"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "TaskLabelAssignment_workspaceId_labelId_idx" ON "TaskLabelAssignment"("workspaceId", "labelId");

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabelAssignment" ADD CONSTRAINT "TaskLabelAssignment_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabelAssignment" ADD CONSTRAINT "TaskLabelAssignment_labelId_workspaceId_fkey" FOREIGN KEY ("labelId", "workspaceId") REFERENCES "TaskLabel"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
