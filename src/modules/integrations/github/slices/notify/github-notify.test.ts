import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LinkedTask } from '../link/link.service';
import type { PullRequestChange, ReviewChange } from '../pull-request/pull-request.effects';

const notify = vi.fn<
  (
    events: {
      type: string;
      recipientId: string;
      actorId: string | null;
      payload: Record<string, unknown>;
    }[],
  ) => Promise<void>
>();
const findUsersByGithubIds = vi.fn<(ids: readonly bigint[]) => Promise<Map<string, string>>>();
const isWorkspaceMember = vi.fn<(workspaceId: string, userId: string) => Promise<boolean>>();
const resolveTaskRefsByIds = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const listPullRequestLinks = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/shared/db', () => ({ prisma: {} }));
vi.mock('@/modules/notifications', () => ({
  notify: (events: Parameters<typeof notify>[0]) => notify(events),
}));
vi.mock('@/modules/tasks', () => ({
  resolveTaskRefsByIds: (...args: unknown[]) => resolveTaskRefsByIds(...args),
}));
vi.mock('@/modules/workspaces', () => ({
  isWorkspaceMember: (workspaceId: string, userId: string) =>
    isWorkspaceMember(workspaceId, userId),
}));
vi.mock('../identity/identity.service', () => ({
  findUsersByGithubIds: (ids: readonly bigint[]) => findUsersByGithubIds(ids),
}));
vi.mock('../link/link.repository', () => ({
  linkRepository: { listPullRequestLinks: (...args: unknown[]) => listPullRequestLinks(...args) },
}));

const { notifyPullRequestChange, notifyReview } = await import('./github-notify');

const workspace = { id: 'w1', slug: 'team', name: 'Команда', taskKey: 'TSK' };
function task(taskId: string, assigneeId: string | null): LinkedTask {
  return {
    taskId,
    number: 42,
    key: 'TSK-42',
    title: 'Вход',
    assigneeId,
    createdById: null,
    workspace,
  };
}
const pullRequest = {
  id: 1001n,
  number: 12,
  title: 'Fix login',
  url: 'https://github.com/acme/web/pull/12',
  state: 'open' as const,
  repositoryFullName: 'acme/web',
  authorId: 501n,
  authorLogin: 'dev',
};
function change(overrides: Partial<PullRequestChange>): PullRequestChange {
  return {
    pullRequest,
    transition: null,
    added: [],
    active: [],
    sender: { id: 501n, login: 'dev' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  notify.mockResolvedValue();
  findUsersByGithubIds.mockResolvedValue(new Map([['501', 'u-dev']]));
});

describe('notifyPullRequestChange', () => {
  it('notifies assignees of newly linked tasks with PR details and GitHub actor', async () => {
    await notifyPullRequestChange(change({ added: [task('t1', 'u-a'), task('t2', null)] }));
    const [events] = notify.mock.calls[0]!;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'pr_linked',
      recipientId: 'u-a',
      actorId: 'u-dev',
      payload: {
        actorName: '@dev',
        taskKey: 'TSK-42',
        repositoryFullName: 'acme/web',
        pullRequestNumber: 12,
      },
    });
  });

  it('notifies all linked tasks on merge instead of linking', async () => {
    await notifyPullRequestChange(
      change({
        transition: 'merged',
        pullRequest: { ...pullRequest, state: 'merged' },
        added: [task('t1', 'u-a')],
        active: [task('t1', 'u-a'), task('t3', 'u-b')],
      }),
    );
    const [events] = notify.mock.calls[0]!;
    expect(events.map((event) => [event.type, event.recipientId])).toEqual([
      ['pr_merged', 'u-a'],
      ['pr_merged', 'u-b'],
    ]);
  });

  it('sends nothing without assignees', async () => {
    await notifyPullRequestChange(change({ added: [task('t1', null)] }));
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps unknown GitHub sender as login without actor id', async () => {
    findUsersByGithubIds.mockResolvedValue(new Map());
    await notifyPullRequestChange(change({ added: [task('t1', 'u-a')] }));
    expect(notify.mock.calls[0]![0][0]).toMatchObject({
      actorId: null,
      payload: { actorName: '@dev' },
    });
  });
});

describe('notifyReview', () => {
  const review: ReviewChange = {
    pullRequestId: 1001n,
    workspaces: [workspace],
    reviewState: 'changes_requested',
    pullRequest: {
      number: 12,
      title: 'Fix login',
      url: pullRequest.url,
      repositoryFullName: 'acme/web',
      authorId: 501n,
    },
    sender: { id: 700n, login: 'reviewer' },
  };

  beforeEach(() => {
    listPullRequestLinks.mockResolvedValue([
      { taskId: 't1', workspaceId: 'w1', source: 'auto', dismissedAt: null },
    ]);
    resolveTaskRefsByIds.mockResolvedValue([task('t1', 'u-a')]);
    isWorkspaceMember.mockResolvedValue(true);
  });

  it('notifies PR author who is a workspace member', async () => {
    await notifyReview(review);
    expect(notify.mock.calls[0]![0][0]).toMatchObject({
      type: 'pr_review',
      recipientId: 'u-dev',
      payload: { reviewState: 'changes_requested', actorName: '@reviewer' },
    });
  });

  it('skips authors without linked GitHub or outside the workspace', async () => {
    findUsersByGithubIds.mockResolvedValue(new Map());
    await notifyReview(review);
    expect(notify).not.toHaveBeenCalled();

    findUsersByGithubIds.mockResolvedValue(new Map([['501', 'u-dev']]));
    isWorkspaceMember.mockResolvedValue(false);
    await notifyReview(review);
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips PRs without active links in the workspace', async () => {
    listPullRequestLinks.mockResolvedValue([
      { taskId: 't1', workspaceId: 'w1', source: 'auto', dismissedAt: new Date() },
    ]);
    await notifyReview(review);
    expect(notify).not.toHaveBeenCalled();
  });
});
