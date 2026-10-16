-- CreateTable
CREATE TABLE "GithubAppConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "appId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "htmlUrl" TEXT NOT NULL,
    "ownerLogin" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "webhookActive" BOOLEAN NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubAppConfig_pkey" PRIMARY KEY ("id")
);
