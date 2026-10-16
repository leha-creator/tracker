-- CreateEnum
CREATE TYPE "GithubPrState" AS ENUM ('open', 'draft', 'merged', 'closed');

-- CreateEnum
CREATE TYPE "GithubReviewState" AS ENUM ('none', 'approved', 'changes_requested');

-- CreateEnum
CREATE TYPE "GithubChecksState" AS ENUM ('none', 'pending', 'success', 'failure');

-- CreateEnum
CREATE TYPE "GithubLinkSource" AS ENUM ('auto', 'manual');

-- CreateTable
CREATE TABLE "GithubInstallation" (
    "id" BIGINT NOT NULL,
    "accountId" BIGINT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceGithubInstallation" (
    "workspaceId" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceGithubInstallation_pkey" PRIMARY KEY ("workspaceId","installationId")
);

-- CreateTable
CREATE TABLE "GithubRepository" (
    "id" BIGINT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "fullName" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL,
    "defaultBranch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceGithubRepository" (
    "workspaceId" TEXT NOT NULL,
    "repositoryId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceGithubRepository_pkey" PRIMARY KEY ("workspaceId","repositoryId")
);

-- CreateTable
CREATE TABLE "GithubPullRequest" (
    "id" BIGINT NOT NULL,
    "repositoryId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "state" "GithubPrState" NOT NULL,
    "headRef" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "authorId" BIGINT,
    "authorLogin" TEXT,
    "reviewState" "GithubReviewState" NOT NULL DEFAULT 'none',
    "checksState" "GithubChecksState" NOT NULL DEFAULT 'none',
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "githubUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubPullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubPullRequestReview" (
    "pullRequestId" BIGINT NOT NULL,
    "reviewerId" BIGINT NOT NULL,
    "state" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubPullRequestReview_pkey" PRIMARY KEY ("pullRequestId","reviewerId")
);

-- CreateTable
CREATE TABLE "GithubCheckSuite" (
    "id" BIGINT NOT NULL,
    "repositoryId" BIGINT NOT NULL,
    "headSha" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "conclusion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubCheckSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPullRequest" (
    "taskId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pullRequestId" BIGINT NOT NULL,
    "source" "GithubLinkSource" NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPullRequest_pkey" PRIMARY KEY ("taskId","pullRequestId")
);

-- CreateTable
CREATE TABLE "TaskGithubBranch" (
    "taskId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "repositoryId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskGithubBranch_pkey" PRIMARY KEY ("taskId","repositoryId","name")
);

-- CreateTable
CREATE TABLE "TaskGithubCommit" (
    "taskId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "repositoryId" BIGINT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authorLogin" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskGithubCommit_pkey" PRIMARY KEY ("taskId","repositoryId","sha")
);

-- CreateTable
CREATE TABLE "GithubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubProjectAutomation" (
    "projectId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prOpenedStatusId" UUID,
    "prMergedStatusId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubProjectAutomation_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE INDEX "WorkspaceGithubInstallation_installationId_idx" ON "WorkspaceGithubInstallation"("installationId");

-- CreateIndex
CREATE INDEX "WorkspaceGithubInstallation_connectedById_idx" ON "WorkspaceGithubInstallation"("connectedById");

-- CreateIndex
CREATE INDEX "GithubRepository_installationId_idx" ON "GithubRepository"("installationId");

-- CreateIndex
CREATE INDEX "WorkspaceGithubRepository_repositoryId_idx" ON "WorkspaceGithubRepository"("repositoryId");

-- CreateIndex
CREATE INDEX "GithubPullRequest_repositoryId_headSha_idx" ON "GithubPullRequest"("repositoryId", "headSha");

-- CreateIndex
CREATE UNIQUE INDEX "GithubPullRequest_repositoryId_number_key" ON "GithubPullRequest"("repositoryId", "number");

-- CreateIndex
CREATE INDEX "GithubCheckSuite_repositoryId_headSha_idx" ON "GithubCheckSuite"("repositoryId", "headSha");

-- CreateIndex
CREATE INDEX "TaskPullRequest_workspaceId_pullRequestId_idx" ON "TaskPullRequest"("workspaceId", "pullRequestId");

-- CreateIndex
CREATE INDEX "TaskPullRequest_pullRequestId_idx" ON "TaskPullRequest"("pullRequestId");

-- CreateIndex
CREATE INDEX "TaskGithubBranch_workspaceId_idx" ON "TaskGithubBranch"("workspaceId");

-- CreateIndex
CREATE INDEX "TaskGithubBranch_repositoryId_name_idx" ON "TaskGithubBranch"("repositoryId", "name");

-- CreateIndex
CREATE INDEX "TaskGithubCommit_taskId_committedAt_idx" ON "TaskGithubCommit"("taskId", "committedAt");

-- CreateIndex
CREATE INDEX "TaskGithubCommit_workspaceId_idx" ON "TaskGithubCommit"("workspaceId");

-- CreateIndex
CREATE INDEX "TaskGithubCommit_repositoryId_idx" ON "TaskGithubCommit"("repositoryId");

-- CreateIndex
CREATE INDEX "GithubWebhookDelivery_receivedAt_idx" ON "GithubWebhookDelivery"("receivedAt");

-- CreateIndex
CREATE INDEX "GithubProjectAutomation_workspaceId_idx" ON "GithubProjectAutomation"("workspaceId");

-- CreateIndex
CREATE INDEX "GithubProjectAutomation_prOpenedStatusId_idx" ON "GithubProjectAutomation"("prOpenedStatusId");

-- CreateIndex
CREATE INDEX "GithubProjectAutomation_prMergedStatusId_idx" ON "GithubProjectAutomation"("prMergedStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubProjectAutomation_projectId_workspaceId_key" ON "GithubProjectAutomation"("projectId", "workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceGithubInstallation" ADD CONSTRAINT "WorkspaceGithubInstallation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceGithubInstallation" ADD CONSTRAINT "WorkspaceGithubInstallation_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GithubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceGithubInstallation" ADD CONSTRAINT "WorkspaceGithubInstallation_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubRepository" ADD CONSTRAINT "GithubRepository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GithubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceGithubRepository" ADD CONSTRAINT "WorkspaceGithubRepository_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceGithubRepository" ADD CONSTRAINT "WorkspaceGithubRepository_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubPullRequest" ADD CONSTRAINT "GithubPullRequest_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubPullRequestReview" ADD CONSTRAINT "GithubPullRequestReview_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "GithubPullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubCheckSuite" ADD CONSTRAINT "GithubCheckSuite_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPullRequest" ADD CONSTRAINT "TaskPullRequest_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPullRequest" ADD CONSTRAINT "TaskPullRequest_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "GithubPullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGithubBranch" ADD CONSTRAINT "TaskGithubBranch_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGithubBranch" ADD CONSTRAINT "TaskGithubBranch_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGithubCommit" ADD CONSTRAINT "TaskGithubCommit_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGithubCommit" ADD CONSTRAINT "TaskGithubCommit_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubProjectAutomation" ADD CONSTRAINT "GithubProjectAutomation_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubProjectAutomation" ADD CONSTRAINT "GithubProjectAutomation_prOpenedStatusId_fkey" FOREIGN KEY ("prOpenedStatusId") REFERENCES "ProjectStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubProjectAutomation" ADD CONSTRAINT "GithubProjectAutomation_prMergedStatusId_fkey" FOREIGN KEY ("prMergedStatusId") REFERENCES "ProjectStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

