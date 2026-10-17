-- CreateTable
CREATE TABLE "TaskWatcher" (
    "taskId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskWatcher_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "TaskWatcher_workspaceId_userId_idx" ON "TaskWatcher"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Наблюдатели существующих задач: автор и ответственный, если они ещё участники и не агенты.
INSERT INTO "TaskWatcher" ("taskId", "userId", "workspaceId")
SELECT t."id", u."userId", t."workspaceId"
FROM "Task" t
CROSS JOIN LATERAL (VALUES (t."createdById"), (t."assigneeId")) AS u("userId")
JOIN "WorkspaceMember" m ON m."workspaceId" = t."workspaceId" AND m."userId" = u."userId"
JOIN "User" usr ON usr."id" = u."userId" AND usr."isAgent" = false
WHERE u."userId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Участник покинул пространство — его подписки на задачи этого пространства удаляются.
CREATE FUNCTION "task_unwatch_removed_member"() RETURNS trigger AS $$
BEGIN
    DELETE FROM "TaskWatcher"
    WHERE "workspaceId" = OLD."workspaceId" AND "userId" = OLD."userId";
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkspaceMember_unwatch_tasks"
AFTER DELETE ON "WorkspaceMember"
FOR EACH ROW EXECUTE FUNCTION "task_unwatch_removed_member"();
