import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

import type { ChecksState, PullRequestState, ReviewState } from '../../models';

export interface PullRequestWrite {
  id: bigint;
  repositoryId: bigint;
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
  headRef: string;
  headSha: string;
  authorId: bigint | null;
  authorLogin: string | null;
  checksState: ChecksState;
  mergedAt: Date | null;
  closedAt: Date | null;
  githubUpdatedAt: Date;
}

export const pullRequestRepository = {
  /** Пространства, где репозиторий выбран владельцем и задан ключ задач. */
  listRepositoryWorkspaces(db: TransactionClient, repositoryId: bigint) {
    return db.workspaceGithubRepository
      .findMany({
        where: { repositoryId, workspace: { taskKey: { not: null } } },
        select: { workspace: { select: { id: true, slug: true, name: true, taskKey: true } } },
      })
      .then((rows) =>
        rows.map(({ workspace }) => ({
          id: workspace.id,
          slug: workspace.slug,
          name: workspace.name,
          taskKey: workspace.taskKey!,
        })),
      );
  },

  /** Обновляет имя и ветку по умолчанию (репозиторий могли переименовать). */
  async updateRepositoryInfo(
    db: TransactionClient,
    repository: { id: bigint; fullName: string; private: boolean; defaultBranch?: string },
  ): Promise<void> {
    await db.githubRepository.updateMany({
      where: { id: repository.id },
      data: {
        fullName: repository.fullName,
        private: repository.private,
        ...(repository.defaultBranch !== undefined && { defaultBranch: repository.defaultBranch }),
      },
    });
  },

  findPullRequest(db: TransactionClient, id: bigint) {
    return db.githubPullRequest.findUnique({
      where: { id },
      select: { id: true, state: true, headSha: true, reviewState: true, githubUpdatedAt: true },
    });
  },

  async upsertPullRequest(db: TransactionClient, data: PullRequestWrite): Promise<void> {
    const { id, ...fields } = data;
    await db.githubPullRequest.upsert({ where: { id }, create: data, update: fields });
  },

  findReview(db: TransactionClient, pullRequestId: bigint, reviewerId: bigint) {
    return db.githubPullRequestReview.findUnique({
      where: { pullRequestId_reviewerId: { pullRequestId, reviewerId } },
      select: { state: true },
    });
  },

  async upsertReview(
    db: TransactionClient,
    data: { pullRequestId: bigint; reviewerId: bigint; state: string; submittedAt: Date },
  ): Promise<void> {
    const { pullRequestId, reviewerId, ...fields } = data;
    await db.githubPullRequestReview.upsert({
      where: { pullRequestId_reviewerId: { pullRequestId, reviewerId } },
      create: data,
      update: fields,
    });
  },

  listReviews(db: TransactionClient, pullRequestId: bigint) {
    return db.githubPullRequestReview.findMany({
      where: { pullRequestId },
      select: { state: true },
    });
  },

  async setReviewState(db: TransactionClient, id: bigint, reviewState: ReviewState): Promise<void> {
    await db.githubPullRequest.update({ where: { id }, data: { reviewState } });
  },

  async upsertCheckSuite(
    db: TransactionClient,
    data: {
      id: bigint;
      repositoryId: bigint;
      headSha: string;
      status: string;
      conclusion: string | null;
    },
  ): Promise<void> {
    const { id, ...fields } = data;
    await db.githubCheckSuite.upsert({ where: { id }, create: data, update: fields });
  },

  listCheckSuites(db: TransactionClient, repositoryId: bigint, headSha: string) {
    return db.githubCheckSuite.findMany({
      where: { repositoryId, headSha },
      select: { status: true, conclusion: true },
    });
  },

  /** Итог CI всем PR репозитория с этим последним коммитом; возвращает их id. */
  async setChecksStateBySha(
    db: TransactionClient,
    repositoryId: bigint,
    headSha: string,
    checksState: ChecksState,
  ): Promise<bigint[]> {
    const rows = await db.githubPullRequest.findMany({
      where: { repositoryId, headSha },
      select: { id: true },
    });
    if (rows.length > 0) {
      await db.githubPullRequest.updateMany({
        where: { repositoryId, headSha },
        data: { checksState },
      });
    }
    return rows.map((row) => row.id);
  },

  /** PR задачи (без отвязанных вручную) с репозиторием — для страницы задачи. */
  listForTask(workspaceId: string, taskId: string) {
    return prisma.taskPullRequest.findMany({
      where: { workspaceId, taskId, dismissedAt: null },
      orderBy: { pullRequest: { githubUpdatedAt: 'desc' } },
      select: {
        source: true,
        pullRequest: {
          select: {
            id: true,
            number: true,
            title: true,
            url: true,
            state: true,
            reviewState: true,
            checksState: true,
            authorLogin: true,
            mergedAt: true,
            githubUpdatedAt: true,
            repository: { select: { fullName: true } },
          },
        },
      },
    });
  },

  /** Состояния PR задач (без отвязанных) — для индикаторов на доске и в списке. */
  listStatesForTasks(workspaceId: string, taskIds: string[]) {
    return prisma.taskPullRequest.findMany({
      where: { workspaceId, taskId: { in: taskIds }, dismissedAt: null },
      select: { taskId: true, pullRequest: { select: { state: true } } },
    });
  },
};
