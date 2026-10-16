-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('mention', 'task_assigned', 'task_comment', 'workspace_invitation');

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "position" TEXT,
    "bio" TEXT,
    "avatarKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actorId" TEXT,
    "taskId" UUID,
    "commentId" UUID,
    "invitationId" TEXT,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL,
    "email" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_avatarKey_key" ON "UserProfile"("avatarKey");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_idx" ON "Notification"("workspaceId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Вручную: участника удаляет плагин Better Auth вне транзакций приложения, а модуль workspaces
-- не знает об уведомлениях. Уведомления пространства у вышедшего участника удаляет БД;
-- приглашения остаются (относятся к пространству, где он ещё не участник).
CREATE FUNCTION "notification_remove_for_removed_member"() RETURNS trigger AS $$
BEGIN
    DELETE FROM "Notification"
    WHERE "workspaceId" = OLD."workspaceId"
      AND "userId" = OLD."userId"
      AND "type" <> 'workspace_invitation';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkspaceMember_remove_notifications"
AFTER DELETE ON "WorkspaceMember"
FOR EACH ROW EXECUTE FUNCTION "notification_remove_for_removed_member"();
