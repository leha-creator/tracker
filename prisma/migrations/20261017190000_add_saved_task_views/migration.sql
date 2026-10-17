-- CreateEnum
CREATE TYPE "SavedTaskViewScope" AS ENUM ('workspace', 'project', 'mine');

-- CreateTable
CREATE TABLE "SavedTaskView" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "SavedTaskViewScope" NOT NULL,
    "workspaceId" TEXT,
    "projectId" UUID,
    "name" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedTaskView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedTaskView_userId_scope_workspaceId_projectId_idx" ON "SavedTaskView"("userId", "scope", "workspaceId", "projectId");

-- AddForeignKey
ALTER TABLE "SavedTaskView" ADD CONSTRAINT "SavedTaskView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedTaskView" ADD CONSTRAINT "SavedTaskView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedTaskView" ADD CONSTRAINT "SavedTaskView_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Область задаёт, какие ссылки есть: «Мои задачи» — без пространства, проект — с проектом.
ALTER TABLE "SavedTaskView" ADD CONSTRAINT "SavedTaskView_scope_check" CHECK (
    ("scope" = 'mine') = ("workspaceId" IS NULL)
    AND ("scope" = 'project') = ("projectId" IS NOT NULL)
);

ALTER TABLE "SavedTaskView" ADD CONSTRAINT "SavedTaskView_name_check" CHECK (
    char_length("name") BETWEEN 1 AND 40
);

ALTER TABLE "SavedTaskView" ADD CONSTRAINT "SavedTaskView_params_check" CHECK (
    char_length("params") <= 2000
);

-- Имя уникально в области пользователя (без учёта регистра); NULL-колонки сравниваются через COALESCE.
CREATE UNIQUE INDEX "SavedTaskView_user_scope_name_key" ON "SavedTaskView" (
    "userId",
    "scope",
    COALESCE("workspaceId", ''),
    COALESCE("projectId", '00000000-0000-0000-0000-000000000000'::uuid),
    lower("name")
);

-- Участник покинул пространство — его сохранённые фильтры в этом пространстве удаляются.
CREATE FUNCTION "saved_task_view_remove_member"() RETURNS trigger AS $$
BEGIN
    DELETE FROM "SavedTaskView"
    WHERE "workspaceId" = OLD."workspaceId" AND "userId" = OLD."userId";
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkspaceMember_remove_saved_task_views"
AFTER DELETE ON "WorkspaceMember"
FOR EACH ROW EXECUTE FUNCTION "saved_task_view_remove_member"();
