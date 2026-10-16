import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

export const linkRepository = {
  /** Все связи PR с задачами (включая отвязанные вручную) во всех пространствах. */
  listPullRequestLinks(db: TransactionClient, pullRequestId: bigint) {
    return db.taskPullRequest.findMany({
      where: { pullRequestId },
      select: { taskId: true, workspaceId: true, source: true, dismissedAt: true },
    });
  },

  async createPullRequestLinks(
    db: TransactionClient,
    rows: {
      taskId: string;
      workspaceId: string;
      pullRequestId: bigint;
      source: 'auto' | 'manual';
    }[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { count } = await db.taskPullRequest.createMany({ data: rows, skipDuplicates: true });
    return count;
  },

  async deletePullRequestLinks(
    db: TransactionClient,
    pullRequestId: bigint,
    taskIds: string[],
  ): Promise<number> {
    if (taskIds.length === 0) return 0;
    const { count } = await db.taskPullRequest.deleteMany({
      where: { pullRequestId, taskId: { in: taskIds }, source: 'auto', dismissedAt: null },
    });
    return count;
  },

  /** Ветка задачи: новая или снова существующая (deletedAt сбрасывается). */
  async upsertBranch(
    db: TransactionClient,
    data: { taskId: string; workspaceId: string; repositoryId: bigint; name: string },
  ): Promise<void> {
    const { taskId, repositoryId, name } = data;
    await db.taskGithubBranch.upsert({
      where: { taskId_repositoryId_name: { taskId, repositoryId, name } },
      create: data,
      update: { deletedAt: null },
    });
  },

  /** Ветку удалили в GitHub — у всех задач она становится зачёркнутой. */
  async markBranchDeleted(
    db: TransactionClient,
    repositoryId: bigint,
    name: string,
  ): Promise<number> {
    const { count } = await db.taskGithubBranch.updateMany({
      where: { repositoryId, name, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return count;
  },

  async createCommits(
    db: TransactionClient,
    rows: {
      taskId: string;
      workspaceId: string;
      repositoryId: bigint;
      sha: string;
      message: string;
      url: string;
      authorLogin: string | null;
      committedAt: Date;
    }[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { count } = await db.taskGithubCommit.createMany({ data: rows, skipDuplicates: true });
    return count;
  },

  listBranchesForTask(workspaceId: string, taskId: string) {
    return prisma.taskGithubBranch.findMany({
      where: { workspaceId, taskId },
      orderBy: [{ deletedAt: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'desc' }],
      select: { name: true, deletedAt: true, repository: { select: { fullName: true } } },
    });
  },

  listCommitsForTask(workspaceId: string, taskId: string, take: number) {
    return prisma.taskGithubCommit.findMany({
      where: { workspaceId, taskId },
      orderBy: { committedAt: 'desc' },
      take,
      select: {
        sha: true,
        message: true,
        url: true,
        authorLogin: true,
        committedAt: true,
        repository: { select: { fullName: true } },
      },
    });
  },

  countCommitsForTask(workspaceId: string, taskId: string): Promise<number> {
    return prisma.taskGithubCommit.count({ where: { workspaceId, taskId } });
  },

  /** Репозиторий, выбранный в пространстве, по owner/name (без учёта регистра, как в GitHub). */
  findWorkspaceRepositoryByName(workspaceId: string, fullName: string) {
    return prisma.githubRepository.findFirst({
      where: {
        fullName: { equals: fullName, mode: 'insensitive' },
        workspaces: { some: { workspaceId } },
      },
      select: { id: true, fullName: true, installationId: true },
    });
  },

  /** Ручная связь: создаётся или восстанавливается (снимает отметку «отвязан»). */
  async upsertManualLink(
    db: TransactionClient,
    data: { taskId: string; workspaceId: string; pullRequestId: bigint },
  ): Promise<void> {
    const { taskId, pullRequestId } = data;
    await db.taskPullRequest.upsert({
      where: { taskId_pullRequestId: { taskId, pullRequestId } },
      create: { ...data, source: 'manual' },
      update: { source: 'manual', dismissedAt: null },
    });
  },

  /** Отвязать PR от задачи: автоматика его больше не восстановит. */
  async dismissLink(workspaceId: string, taskId: string, pullRequestId: bigint): Promise<number> {
    const { count } = await prisma.taskPullRequest.updateMany({
      where: { workspaceId, taskId, pullRequestId, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
    return count;
  },
};
