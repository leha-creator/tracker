import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskRefDto } from '@/modules/tasks';

import pullRequestOpened from '../__fixtures__/pull-request-opened.json';
import type { WebhookContext } from '../webhook.types';

type Link = {
  taskId: string;
  workspaceId: string;
  source: 'auto' | 'manual';
  dismissedAt: Date | null;
};

const TSK = { id: 'w-tsk', slug: 'team', name: 'Команда', taskKey: 'TSK' };
const OPS = { id: 'w-ops', slug: 'ops', name: 'Ops', taskKey: 'OPS' };
const T42 = '0192f3a0-0000-7000-8000-000000000042';
const T43 = '0192f3a0-0000-7000-8000-000000000043';
const T7 = '0192f3a0-0000-7000-8000-000000000007';
const T99 = '0192f3a0-0000-7000-8000-000000000099';

const tasksByWorkspace: Record<string, TaskRefDto[]> = {
  'w-tsk': [42, 43].map((number) => ref(number === 42 ? T42 : T43, number, 'TSK')),
  'w-ops': [ref(T7, 7, 'OPS')],
};
function ref(taskId: string, number: number, key: string): TaskRefDto {
  return {
    taskId,
    number,
    key: `${key}-${number}`,
    title: `Задача ${number}`,
    assigneeId: 'u-assignee',
    createdById: 'u-author',
  };
}

const prRepo = {
  listRepositoryWorkspaces: vi.fn<(...args: unknown[]) => Promise<(typeof TSK)[]>>(),
  updateRepositoryInfo: vi.fn(),
  findPullRequest: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  upsertPullRequest: vi.fn<(db: unknown, data: Record<string, unknown>) => Promise<void>>(),
  listCheckSuites:
    vi.fn<(...args: unknown[]) => Promise<{ status: string; conclusion: string | null }[]>>(),
  findReview: vi.fn<(...args: unknown[]) => Promise<{ state: string } | null>>(),
  upsertReview: vi.fn<(db: unknown, data: Record<string, unknown>) => Promise<void>>(),
  listReviews: vi.fn<(...args: unknown[]) => Promise<{ state: string }[]>>(),
  setReviewState: vi.fn<(db: unknown, id: bigint, state: string) => Promise<void>>(),
  upsertCheckSuite: vi.fn(),
  setChecksStateBySha: vi.fn<(...args: unknown[]) => Promise<bigint[]>>(),
};
const linkRepo = {
  listPullRequestLinks: vi.fn<(...args: unknown[]) => Promise<Link[]>>(),
  createPullRequestLinks:
    vi.fn<(db: unknown, rows: { taskId: string; workspaceId: string }[]) => Promise<number>>(),
  deletePullRequestLinks:
    vi.fn<(db: unknown, prId: bigint, taskIds: string[]) => Promise<number>>(),
};
const effects = {
  schedulePullRequestEffects: vi.fn(),
  scheduleReviewEffects: vi.fn(),
  scheduleWorkspaceRevalidation: vi.fn(),
};

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/modules/tasks', () => ({
  resolveTaskRefs: (workspaceId: string, numbers: number[]) =>
    Promise.resolve(
      (tasksByWorkspace[workspaceId] ?? []).filter((task) => numbers.includes(task.number)),
    ),
  resolveTaskRefsByIds: (workspaceId: string, ids: string[]) =>
    Promise.resolve(ids.includes(T99) && workspaceId === 'w-tsk' ? [ref(T99, 99, 'TSK')] : []),
}));
vi.mock('@/modules/projects', () => ({ isEntityId: () => true }));
vi.mock('../../pull-request/pull-request.repository', () => ({ pullRequestRepository: prRepo }));
vi.mock('../../link/link.repository', () => ({ linkRepository: linkRepo }));
vi.mock('../../pull-request/pull-request.effects', () => effects);
vi.mock('../webhook.repository', () => ({
  webhookRepository: { isInstallationSuspended: () => Promise.resolve(false) },
}));

const { handleCheckSuite, handlePullRequest, handlePullRequestReview } =
  await import('./pull-request');

const ctx = { tx: {}, deliveryId: 'd', afterCommit: vi.fn() } as unknown as WebhookContext;

function prPayload(overrides: Record<string, unknown> = {}, action = 'opened') {
  return {
    ...pullRequestOpened,
    action,
    pull_request: { ...pullRequestOpened.pull_request, ...overrides },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  prRepo.listRepositoryWorkspaces.mockResolvedValue([TSK, OPS]);
  prRepo.findPullRequest.mockResolvedValue(null);
  prRepo.listCheckSuites.mockResolvedValue([]);
  linkRepo.listPullRequestLinks.mockResolvedValue([]);
  linkRepo.createPullRequestLinks.mockResolvedValue(0);
  linkRepo.deletePullRequestLinks.mockResolvedValue(0);
  prRepo.listReviews.mockResolvedValue([]);
  prRepo.setChecksStateBySha.mockResolvedValue([]);
});

describe('handlePullRequest', () => {
  it('links tasks by branch, title and body in matching workspaces only', async () => {
    await expect(handlePullRequest(prPayload(), ctx)).resolves.toBe('handled');

    const [, rows] = linkRepo.createPullRequestLinks.mock.calls[0]!;
    expect(rows.map((row) => [row.workspaceId, row.taskId]).sort()).toEqual(
      [
        ['w-ops', T7],
        ['w-tsk', T42],
        ['w-tsk', T43],
      ].sort(),
    );
    // TSK-1000 нет в пространстве — пропущен.
    const change = effects.schedulePullRequestEffects.mock.calls[0]![0] as {
      transition: string;
      active: unknown[];
      pullRequest: { state: string };
    };
    expect(change.transition).toBe('opened');
    expect(change.pullRequest.state).toBe('open');
    expect(change.active).toHaveLength(3);
  });

  it('stores PR with state, head and author', async () => {
    await handlePullRequest(prPayload({ draft: true }), ctx);
    const [, data] = prRepo.upsertPullRequest.mock.calls[0]!;
    expect(data).toMatchObject({
      id: 1001n,
      repositoryId: 5n,
      number: 12,
      state: 'draft',
      headRef: 'tsk-43-login',
      headSha: 'abc123',
      authorId: 501n,
      checksState: 'none',
    });
  });

  it('ignores repositories not enabled in any workspace without storing anything', async () => {
    prRepo.listRepositoryWorkspaces.mockResolvedValue([]);
    await expect(handlePullRequest(prPayload(), ctx)).resolves.toBe('ignored');
    expect(prRepo.upsertPullRequest).not.toHaveBeenCalled();
  });

  it('skips stale events', async () => {
    prRepo.findPullRequest.mockResolvedValue({
      id: 1001n,
      state: 'merged',
      headSha: 'abc123',
      reviewState: 'none',
      githubUpdatedAt: new Date('2026-10-16T11:00:00Z'),
    });
    await expect(handlePullRequest(prPayload(), ctx)).resolves.toBe('ignored');
    expect(prRepo.upsertPullRequest).not.toHaveBeenCalled();
  });

  it('removes vanished auto links, keeps dismissed and manual ones', async () => {
    linkRepo.listPullRequestLinks.mockResolvedValue([
      { taskId: T42, workspaceId: 'w-tsk', source: 'auto', dismissedAt: null },
      { taskId: T43, workspaceId: 'w-tsk', source: 'auto', dismissedAt: new Date() },
      { taskId: T99, workspaceId: 'w-tsk', source: 'manual', dismissedAt: null },
      { taskId: T7, workspaceId: 'w-ops', source: 'auto', dismissedAt: null },
    ]);
    linkRepo.deletePullRequestLinks.mockResolvedValue(1);
    await handlePullRequest(
      prPayload(
        { title: 'Fix login', body: null, head: { ref: 'tsk-43-login', sha: 'abc123' } },
        'edited',
      ),
      ctx,
    );
    // Ссылка только на TSK-43 (отвязана вручную) — не восстанавливается; TSK-42 и OPS-7 сняты.
    expect(linkRepo.createPullRequestLinks.mock.calls[0]![1]).toEqual([]);
    expect(linkRepo.deletePullRequestLinks.mock.calls[0]![2].sort()).toEqual([T42, T7].sort());
    const change = effects.schedulePullRequestEffects.mock.calls[0]![0] as {
      active: { taskId: string }[];
      transition: string | null;
    };
    expect(change.active.map((task) => task.taskId)).toEqual([T99]);
    expect(change.transition).toBe('opened');
  });

  it('reports merge transition', async () => {
    prRepo.findPullRequest.mockResolvedValue({
      id: 1001n,
      state: 'open',
      headSha: 'abc123',
      reviewState: 'none',
      githubUpdatedAt: new Date('2026-10-16T09:00:00Z'),
    });
    await handlePullRequest(
      prPayload({ state: 'closed', merged: true, merged_at: '2026-10-16T10:00:00Z' }, 'closed'),
      ctx,
    );
    const change = effects.schedulePullRequestEffects.mock.calls[0]![0] as { transition: string };
    expect(change.transition).toBe('merged');
  });

  it('ignores unrelated actions', async () => {
    await expect(handlePullRequest(prPayload({}, 'labeled'), ctx)).resolves.toBe('ignored');
  });
});

describe('handlePullRequestReview', () => {
  const review = (state: string, action = 'submitted') => ({
    ...prPayload(),
    action,
    review: { user: { id: 700, login: 'reviewer' }, state, submitted_at: '2026-10-16T10:05:00Z' },
  });

  it('stores reviewer state and aggregates', async () => {
    prRepo.listReviews.mockResolvedValue([{ state: 'approved' }, { state: 'changes_requested' }]);
    await handlePullRequestReview(review('changes_requested'), ctx);
    expect(prRepo.upsertReview.mock.calls[0]![1]).toMatchObject({
      pullRequestId: 1001n,
      reviewerId: 700n,
      state: 'changes_requested',
    });
    expect(prRepo.setReviewState).toHaveBeenCalledWith({}, 1001n, 'changes_requested');
    expect(effects.scheduleReviewEffects).toHaveBeenCalledTimes(1);
  });

  it('keeps approval after a plain comment and does not notify', async () => {
    prRepo.findReview.mockResolvedValue({ state: 'approved' });
    await handlePullRequestReview(review('commented'), ctx);
    expect(prRepo.upsertReview.mock.calls[0]![1]).toMatchObject({ state: 'approved' });
    expect(effects.scheduleReviewEffects).not.toHaveBeenCalled();
  });

  it('dismissed review clears reviewer state', async () => {
    prRepo.findReview.mockResolvedValue({ state: 'changes_requested' });
    await handlePullRequestReview(review('dismissed', 'dismissed'), ctx);
    expect(prRepo.upsertReview.mock.calls[0]![1]).toMatchObject({ state: 'dismissed' });
  });
});

describe('handleCheckSuite', () => {
  it('aggregates suites of the commit into PR checks state', async () => {
    prRepo.listCheckSuites.mockResolvedValue([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'failure' },
    ]);
    prRepo.setChecksStateBySha.mockResolvedValue([1001n]);
    await handleCheckSuite(
      {
        action: 'completed',
        check_suite: { id: 9, head_sha: 'abc123', status: 'completed', conclusion: 'failure' },
        repository: pullRequestOpened.repository,
        installation: pullRequestOpened.installation,
      },
      ctx,
    );
    expect(prRepo.setChecksStateBySha).toHaveBeenCalledWith({}, 5n, 'abc123', 'failure');
    expect(effects.scheduleWorkspaceRevalidation).toHaveBeenCalled();
  });
});
