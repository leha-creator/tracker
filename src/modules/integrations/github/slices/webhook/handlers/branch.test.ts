import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskRefDto } from '@/modules/tasks';

import type { WebhookContext } from '../webhook.types';

const TSK = { id: 'w-tsk', slug: 'team', name: 'Команда', taskKey: 'TSK' };
const T42 = '0192f3a0-0000-7000-8000-000000000042';
const T7 = '0192f3a0-0000-7000-8000-000000000007';

const tasks: TaskRefDto[] = [
  { taskId: T42, number: 42, key: 'TSK-42', title: 'A', assigneeId: null, createdById: null },
  { taskId: T7, number: 7, key: 'TSK-7', title: 'B', assigneeId: null, createdById: null },
];

const linkRepo = {
  upsertBranch: vi.fn<(db: unknown, data: Record<string, unknown>) => Promise<void>>(),
  markBranchDeleted: vi.fn<(...args: unknown[]) => Promise<number>>(),
  createCommits:
    vi.fn<
      (db: unknown, rows: { taskId: string; sha: string; message: string }[]) => Promise<number>
    >(),
};
const listRepositoryWorkspaces = vi.fn<(...args: unknown[]) => Promise<(typeof TSK)[]>>();
const scheduleWorkspaceRevalidation = vi.fn();

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/modules/projects', () => ({ isEntityId: () => true }));
vi.mock('@/modules/tasks', () => ({
  resolveTaskRefs: (_workspaceId: string, numbers: number[]) =>
    Promise.resolve(tasks.filter((task) => numbers.includes(task.number))),
  resolveTaskRefsByIds: () => Promise.resolve([]),
}));
vi.mock('../../link/link.repository', () => ({ linkRepository: linkRepo }));
vi.mock('../../pull-request/pull-request.repository', () => ({
  pullRequestRepository: {
    listRepositoryWorkspaces: (...args: unknown[]) => listRepositoryWorkspaces(...args),
    updateRepositoryInfo: () => Promise.resolve(),
  },
}));
vi.mock('../../pull-request/pull-request.effects', () => ({ scheduleWorkspaceRevalidation }));
vi.mock('../webhook.repository', () => ({
  webhookRepository: { isInstallationSuspended: () => Promise.resolve(false) },
}));

const { handleCreate, handleDelete, handlePush } = await import('./branch');

const ctx = { tx: {}, deliveryId: 'd', afterCommit: vi.fn() } as unknown as WebhookContext;
const repository = { id: 5, full_name: 'acme/web', private: true, default_branch: 'main' };

function commit(id: string, message: string) {
  return {
    id,
    message,
    url: `https://github.com/acme/web/commit/${id}`,
    timestamp: '2026-10-16T10:00:00Z',
    author: { username: 'dev', name: 'Dev' },
  };
}

function push(ref: string, commits: ReturnType<typeof commit>[], deleted = false) {
  return { ref, deleted, commits, repository, installation: { id: 77 } };
}

beforeEach(() => {
  vi.resetAllMocks();
  listRepositoryWorkspaces.mockResolvedValue([TSK]);
  linkRepo.createCommits.mockImplementation((_db, rows) => Promise.resolve(rows.length));
  linkRepo.markBranchDeleted.mockResolvedValue(1);
});

describe('handlePush', () => {
  it('links branch and all pushed commits when the branch references a task', async () => {
    await expect(
      handlePush(push('refs/heads/tsk-42-login', [commit('a1', 'wip'), commit('a2', 'fix')]), ctx),
    ).resolves.toBe('handled');
    expect(linkRepo.upsertBranch).toHaveBeenCalledWith(
      {},
      { taskId: T42, workspaceId: 'w-tsk', repositoryId: 5n, name: 'tsk-42-login' },
    );
    const rows = linkRepo.createCommits.mock.calls[0]![1];
    expect(rows.map((row) => [row.taskId, row.sha])).toEqual([
      [T42, 'a1'],
      [T42, 'a2'],
    ]);
    expect(scheduleWorkspaceRevalidation).toHaveBeenCalled();
  });

  it('links only the commit that mentions a task on a plain branch', async () => {
    await handlePush(
      push('refs/heads/main', [commit('b1', 'refactor'), commit('b2', 'TSK-7: fix\n\nlong body')]),
      ctx,
    );
    expect(linkRepo.upsertBranch).not.toHaveBeenCalled();
    const rows = linkRepo.createCommits.mock.calls[0]![1];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ taskId: T7, sha: 'b2', message: 'TSK-7: fix' });
  });

  it('does not duplicate a task referenced by both branch and message', async () => {
    await handlePush(push('refs/heads/tsk-42', [commit('c1', 'TSK-42 again')]), ctx);
    expect(linkRepo.createCommits.mock.calls[0]![1]).toHaveLength(1);
  });

  it('marks deleted branch', async () => {
    await handlePush(push('refs/heads/tsk-42', [], true), ctx);
    expect(linkRepo.markBranchDeleted).toHaveBeenCalledWith({}, 5n, 'tsk-42');
    expect(linkRepo.createCommits).not.toHaveBeenCalled();
  });

  it('ignores tags and repositories not enabled anywhere', async () => {
    await expect(handlePush(push('refs/tags/v1.0', [commit('d1', 'TSK-42')]), ctx)).resolves.toBe(
      'ignored',
    );
    listRepositoryWorkspaces.mockResolvedValue([]);
    await expect(
      handlePush(push('refs/heads/tsk-42', [commit('d2', 'TSK-42')]), ctx),
    ).resolves.toBe('ignored');
    expect(linkRepo.createCommits).not.toHaveBeenCalled();
  });
});

describe('handleCreate / handleDelete', () => {
  it('links a new branch and marks a deleted one', async () => {
    await expect(
      handleCreate({ ref: 'tsk-7-docs', ref_type: 'branch', repository }, ctx),
    ).resolves.toBe('handled');
    expect(linkRepo.upsertBranch).toHaveBeenCalledWith(
      {},
      { taskId: T7, workspaceId: 'w-tsk', repositoryId: 5n, name: 'tsk-7-docs' },
    );
    await expect(
      handleDelete({ ref: 'tsk-7-docs', ref_type: 'branch', repository }, ctx),
    ).resolves.toBe('handled');
    expect(linkRepo.markBranchDeleted).toHaveBeenCalledWith({}, 5n, 'tsk-7-docs');
  });

  it('ignores tags', async () => {
    await expect(handleCreate({ ref: 'v1', ref_type: 'tag', repository }, ctx)).resolves.toBe(
      'ignored',
    );
  });
});
