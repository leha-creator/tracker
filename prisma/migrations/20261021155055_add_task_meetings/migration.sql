-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'meeting_summary_ready';

-- CreateTable
CREATE TABLE "TaskMeeting" (
    "id" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" UUID NOT NULL,
    "meetMeetingId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hostUserId" TEXT,
    "contextJti" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskMeetingRecap" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "meetRecapId" TEXT NOT NULL,
    "documentId" UUID,
    "actionItems" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskMeetingRecap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetWebhookDelivery" (
    "id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskMeeting_meetMeetingId_key" ON "TaskMeeting"("meetMeetingId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMeeting_contextJti_key" ON "TaskMeeting"("contextJti");

-- CreateIndex
CREATE INDEX "TaskMeeting_workspaceId_taskId_startedAt_idx" ON "TaskMeeting"("workspaceId", "taskId", "startedAt");

-- CreateIndex
CREATE INDEX "TaskMeeting_hostUserId_idx" ON "TaskMeeting"("hostUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMeetingRecap_meetRecapId_key" ON "TaskMeetingRecap"("meetRecapId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMeetingRecap_documentId_key" ON "TaskMeetingRecap"("documentId");

-- CreateIndex
CREATE INDEX "TaskMeetingRecap_meetingId_completedAt_idx" ON "TaskMeetingRecap"("meetingId", "completedAt");

-- CreateIndex
CREATE INDEX "MeetWebhookDelivery_receivedAt_idx" ON "MeetWebhookDelivery"("receivedAt");

-- AddForeignKey
ALTER TABLE "TaskMeeting" ADD CONSTRAINT "TaskMeeting_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMeeting" ADD CONSTRAINT "TaskMeeting_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMeetingRecap" ADD CONSTRAINT "TaskMeetingRecap_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "TaskMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMeetingRecap" ADD CONSTRAINT "TaskMeetingRecap_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
