import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

const requireWorkspaceAccess = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const listStatesForTasks = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const listForTask = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/shared/access', () => ({
  requireWorkspaceAccess: (...args: unknown[]) => requireWorkspaceAccess(...args),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
}));
vi.mock('./pull-request.repository', () => ({
  pullRequestRepository: { listStatesForTasks, listForTask },
}));
vi.mock('../webhook/webhook.repository', () => ({ webhookRepository: {} }));
let enabled = true;
vi.mock('../../github-api', () => ({ isGithubEnabled: () => enabled }));

const { getPullRequestBadges, listTaskPullRequests } = await import('./pull-request.service');

const session = { user: { id: 'u1' } } as AuthSession;
const T1 = '0192f3a0-0000-7000-8000-000000000001';
const T2 = '0192f3a0-0000-7000-8000-000000000002';

beforeEach(() => {
  vi.resetAllMocks();
  requireWorkspaceAccess.mockResolvedValue({});
  enabled = true;
});

describe('getPullRequestBadges', () => {
  it('returns nothing without a query when GitHub is not configured', async () => {
    enabled = false;
    await expect(getPullRequestBadges(session, 'w1', [T1])).resolves.toEqual({});
    expect(listStatesForTasks).not.toHaveBeenCalled();
  });

  it('picks the most visible state per task and counts PRs', async () => {
    listStatesForTasks.mockResolvedValue([
      { taskId: T1, pullRequest: { state: 'merged' } },
      { taskId: T1, pullRequest: { state: 'open' } },
      { taskId: T2, pullRequest: { state: 'closed' } },
    ]);
    await expect(getPullRequestBadges(session, 'w1', [T1, T2, 'bad'])).resolves.toEqual({
      [T1]: { state: 'open', count: 2 },
      [T2]: { state: 'closed', count: 1 },
    });
    expect(listStatesForTasks).toHaveBeenCalledWith('w1', [T1, T2]);
  });

  it('checks workspace access and skips empty input', async () => {
    await expect(getPullRequestBadges(session, 'w1', [])).resolves.toEqual({});
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(session, 'w1');
    expect(listStatesForTasks).not.toHaveBeenCalled();
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError());
    await expect(getPullRequestBadges(session, 'w2', [T1])).rejects.toThrow(NotFoundError);
  });
});

describe('listTaskPullRequests', () => {
  it('maps rows to DTO with string ids', async () => {
    listForTask.mockResolvedValue([
      {
        source: 'auto',
        pullRequest: {
          id: 1001n,
          number: 12,
          title: 'Fix',
          url: 'https://github.com/acme/web/pull/12',
          state: 'open',
          reviewState: 'approved',
          checksState: 'success',
          authorLogin: 'dev',
          mergedAt: null,
          githubUpdatedAt: new Date('2026-10-16T10:00:00Z'),
          repository: { fullName: 'acme/web' },
        },
      },
    ]);
    const [pr] = await listTaskPullRequests(session, 'w1', T1);
    expect(pr).toMatchObject({
      id: '1001',
      repositoryFullName: 'acme/web',
      state: 'open',
      reviewState: 'approved',
      source: 'auto',
    });
  });
});
