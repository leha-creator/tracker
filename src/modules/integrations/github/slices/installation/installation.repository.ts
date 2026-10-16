import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

export interface InstallationData {
  id: bigint;
  accountId: bigint;
  accountLogin: string;
  accountType: string;
  suspendedAt: Date | null;
}

export interface RepositoryData {
  id: bigint;
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
}

/** Удаляет связи задач пространства с репозиториями (PR, ветки, коммиты): репозиторий отключён. */
async function deleteTaskLinks(
  tx: TransactionClient,
  workspaceId: string,
  repositoryIds: bigint[],
): Promise<void> {
  if (repositoryIds.length === 0) return;
  await tx.taskPullRequest.deleteMany({
    where: { workspaceId, pullRequest: { repositoryId: { in: repositoryIds } } },
  });
  await tx.taskGithubBranch.deleteMany({
    where: { workspaceId, repositoryId: { in: repositoryIds } },
  });
  await tx.taskGithubCommit.deleteMany({
    where: { workspaceId, repositoryId: { in: repositoryIds } },
  });
}

export const installationRepository = {
  async upsertInstallation(db: TransactionClient, data: InstallationData): Promise<void> {
    const { id, ...fields } = data;
    await db.githubInstallation.upsert({ where: { id }, create: data, update: fields });
  },

  /** Репозитории установки по данным GitHub: новые добавляются, пропавшие удаляются (каскадом). */
  async syncRepositories(
    db: TransactionClient,
    installationId: bigint,
    repositories: RepositoryData[],
  ): Promise<{ removed: number }> {
    await installationRepository.upsertRepositories(db, installationId, repositories);
    const { count } = await db.githubRepository.deleteMany({
      where: { installationId, id: { notIn: repositories.map((repository) => repository.id) } },
    });
    return { removed: count };
  },

  async upsertRepositories(
    db: TransactionClient,
    installationId: bigint,
    repositories: RepositoryData[],
  ): Promise<void> {
    for (const repository of repositories) {
      const { id, defaultBranch, ...fields } = repository;
      await db.githubRepository.upsert({
        where: { id },
        create: { ...repository, installationId },
        // В вебхуках установки нет default_branch — известное значение не затираем.
        update: { ...fields, installationId, ...(defaultBranch !== null && { defaultBranch }) },
      });
    }
  },

  async removeRepositories(db: TransactionClient, repositoryIds: bigint[]): Promise<number> {
    if (repositoryIds.length === 0) return 0;
    const { count } = await db.githubRepository.deleteMany({
      where: { id: { in: repositoryIds } },
    });
    return count;
  },

  async deleteInstallation(db: TransactionClient, installationId: bigint): Promise<number> {
    const { count } = await db.githubInstallation.deleteMany({ where: { id: installationId } });
    return count;
  },

  async setSuspended(
    db: TransactionClient,
    installationId: bigint,
    suspendedAt: Date | null,
  ): Promise<number> {
    const { count } = await db.githubInstallation.updateMany({
      where: { id: installationId },
      data: { suspendedAt },
    });
    return count;
  },

  async linkWorkspace(
    db: TransactionClient,
    workspaceId: string,
    installationId: bigint,
    connectedById: string,
  ): Promise<void> {
    await db.workspaceGithubInstallation.upsert({
      where: { workspaceId_installationId: { workspaceId, installationId } },
      create: { workspaceId, installationId, connectedById },
      update: {},
    });
  },

  /** Отключает установку от пространства: выбранные репозитории и связи задач с ними — тоже. */
  async unlinkWorkspace(workspaceId: string, installationId: bigint): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const repositories = await tx.githubRepository.findMany({
        where: { installationId },
        select: { id: true },
      });
      const repositoryIds = repositories.map((repository) => repository.id);
      await deleteTaskLinks(tx, workspaceId, repositoryIds);
      await tx.workspaceGithubRepository.deleteMany({
        where: { workspaceId, repositoryId: { in: repositoryIds } },
      });
      const { count } = await tx.workspaceGithubInstallation.deleteMany({
        where: { workspaceId, installationId },
      });
      return count;
    });
  },

  isLinked(workspaceId: string, installationId: bigint) {
    return prisma.workspaceGithubInstallation
      .findUnique({
        where: { workspaceId_installationId: { workspaceId, installationId } },
        select: { installationId: true },
      })
      .then((row) => row !== null);
  },

  /** Установки пространства с репозиториями и признаком «используется в пространстве». */
  listForWorkspace(workspaceId: string) {
    return prisma.workspaceGithubInstallation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        installation: {
          select: {
            id: true,
            accountLogin: true,
            accountType: true,
            suspendedAt: true,
            repositories: {
              orderBy: { fullName: 'asc' },
              select: {
                id: true,
                fullName: true,
                private: true,
                workspaces: { where: { workspaceId }, select: { workspaceId: true } },
              },
            },
          },
        },
      },
    });
  },

  /** Репозиторий установки, подключённой к пространству (защита от IDOR), или null. */
  findWorkspaceRepository(workspaceId: string, repositoryId: bigint) {
    return prisma.githubRepository.findFirst({
      where: { id: repositoryId, installation: { workspaces: { some: { workspaceId } } } },
      select: { id: true, fullName: true },
    });
  },

  async setRepositoryEnabled(
    workspaceId: string,
    repositoryId: bigint,
    enabled: boolean,
  ): Promise<void> {
    if (enabled) {
      await prisma.workspaceGithubRepository.upsert({
        where: { workspaceId_repositoryId: { workspaceId, repositoryId } },
        create: { workspaceId, repositoryId },
        update: {},
      });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await deleteTaskLinks(tx, workspaceId, [repositoryId]);
      await tx.workspaceGithubRepository.deleteMany({ where: { workspaceId, repositoryId } });
    });
  },
};
