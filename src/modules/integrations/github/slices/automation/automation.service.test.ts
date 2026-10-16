import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { ValidationError } from '@/shared/errors';

import type { LinkedTask } from '../link/link.service';

const listPlacementsForAutomation = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const changePlacementStatusBySystem =
  vi.fn<
    (input: {
      taskId: string;
      projectId: string;
      statusId: string;
      reason: string;
    }) => Promise<boolean>
  >();
const listStatuses = vi.fn<(...args: unknown[]) => Promise<{ id: string }[]>>();
const requireWorkspacePermission = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const repo = {
  findForProject: vi.fn(),
  upsert: vi.fn<(...args: unknown[]) => Promise<void>>(),
  listForProjects: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
};

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/shared/access', () => ({
  requireWorkspacePermission: (...args: unknown[]) => requireWorkspacePermission(...args),
}));
vi.mock('@/modules/projects', () => ({
  listStatuses: (...args: unknown[]) => listStatuses(...args),
}));
vi.mock('@/modules/tasks', () => ({
  listPlacementsForAutomation: (...args: unknown[]) => listPlacementsForAutomation(...args),
  changePlacementStatusBySystem: (input: Parameters<typeof changePlacementStatusBySystem>[0]) =>
    changePlacementStatusBySystem(input),
}));
vi.mock('./automation.repository', () => ({ automationRepository: repo }));

const { applyPullRequestAutomation, updateProjectAutomation } =
  await import('./automation.service');

const workspace = { id: 'w1', slug: 'team', name: 'Команда', taskKey: 'TSK' };
function task(taskId: string): LinkedTask {
  return {
    taskId,
    number: 1,
    key: 'TSK-1',
    title: 'T',
    assigneeId: null,
    createdById: null,
    workspace,
  };
}
const status = (id: string, projectId: string, category: string) => ({ id, projectId, category });

beforeEach(() => {
  vi.resetAllMocks();
  changePlacementStatusBySystem.mockResolvedValue(true);
  repo.listForProjects.mockResolvedValue([
    {
      projectId: 'p1',
      prOpenedStatus: status('p1-review', 'p1', 'in_progress'),
      prMergedStatus: status('p1-done', 'p1', 'done'),
    },
    { projectId: 'p2', prOpenedStatus: null, prMergedStatus: status('p2-done', 'p2', 'done') },
  ]);
});

describe('applyPullRequestAutomation', () => {
  it('moves placements forward in every project by its own setting', async () => {
    listPlacementsForAutomation.mockResolvedValue([
      { taskId: 't1', projectId: 'p1', statusId: 'p1-todo', category: 'todo' },
      { taskId: 't1', projectId: 'p2', statusId: 'p2-todo', category: 'todo' },
    ]);
    await expect(
      applyPullRequestAutomation({
        transition: 'opened',
        state: 'open',
        active: [task('t1')],
        added: [],
      }),
    ).resolves.toBe(1);
    // p2 не настроен на «открыт» — только p1.
    expect(changePlacementStatusBySystem).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        taskId: 't1',
        projectId: 'p1',
        statusId: 'p1-review',
        reason: 'github_pr_opened',
      }),
    );
  });

  it('never moves backwards', async () => {
    listPlacementsForAutomation.mockResolvedValue([
      { taskId: 't1', projectId: 'p1', statusId: 'p1-done', category: 'done' },
    ]);
    await applyPullRequestAutomation({
      transition: 'opened',
      state: 'open',
      active: [task('t1')],
      added: [],
    });
    expect(changePlacementStatusBySystem).not.toHaveBeenCalled();
  });

  it('applies merge to both projects', async () => {
    listPlacementsForAutomation.mockResolvedValue([
      { taskId: 't1', projectId: 'p1', statusId: 'p1-review', category: 'in_progress' },
      { taskId: 't1', projectId: 'p2', statusId: 'p2-todo', category: 'todo' },
    ]);
    await expect(
      applyPullRequestAutomation({
        transition: 'merged',
        state: 'merged',
        active: [task('t1')],
        added: [],
      }),
    ).resolves.toBe(2);
  });

  it('does nothing for drafts and closed PRs without transition', async () => {
    await expect(
      applyPullRequestAutomation({
        transition: null,
        state: 'draft',
        active: [task('t1')],
        added: [task('t2')],
      }),
    ).resolves.toBe(0);
    expect(listPlacementsForAutomation).not.toHaveBeenCalled();
  });

  it('applies current state to newly linked tasks of an already open PR', async () => {
    listPlacementsForAutomation.mockResolvedValue([
      { taskId: 't2', projectId: 'p1', statusId: 'p1-todo', category: 'todo' },
    ]);
    await applyPullRequestAutomation({
      transition: null,
      state: 'open',
      active: [task('t1'), task('t2')],
      added: [task('t2')],
    });
    expect(listPlacementsForAutomation).toHaveBeenCalledWith('w1', ['t2']);
    expect(changePlacementStatusBySystem).toHaveBeenCalledTimes(1);
  });

  it('skips projects whose target status was deleted and survives single failures', async () => {
    repo.listForProjects.mockResolvedValue([
      { projectId: 'p1', prOpenedStatus: null, prMergedStatus: null },
      { projectId: 'p2', prOpenedStatus: null, prMergedStatus: status('p2-done', 'p2', 'done') },
      { projectId: 'p3', prOpenedStatus: null, prMergedStatus: status('p3-done', 'p3', 'done') },
    ]);
    listPlacementsForAutomation.mockResolvedValue([
      { taskId: 't1', projectId: 'p1', statusId: 'x', category: 'todo' },
      { taskId: 't1', projectId: 'p2', statusId: 'y', category: 'todo' },
      { taskId: 't1', projectId: 'p3', statusId: 'z', category: 'todo' },
    ]);
    changePlacementStatusBySystem.mockRejectedValueOnce(new Error('gone'));
    await expect(
      applyPullRequestAutomation({
        transition: 'merged',
        state: 'merged',
        active: [task('t1')],
        added: [],
      }),
    ).resolves.toBe(1);
    expect(changePlacementStatusBySystem).toHaveBeenCalledTimes(2);
  });
});

describe('updateProjectAutomation', () => {
  const session = { user: { id: 'u1' } } as AuthSession;

  beforeEach(() => {
    requireWorkspacePermission.mockResolvedValue({});
    listStatuses.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
  });

  it('saves statuses of the project', async () => {
    await updateProjectAutomation(session, {
      workspaceId: 'w1',
      projectId: 'p1',
      prOpenedStatusId: 's1',
      prMergedStatusId: null,
    });
    expect(requireWorkspacePermission).toHaveBeenCalledWith(session, 'w1', 'manageProjects');
    expect(repo.upsert).toHaveBeenCalledWith('w1', 'p1', {
      prOpenedStatusId: 's1',
      prMergedStatusId: null,
    });
  });

  it('rejects a status of another project', async () => {
    await expect(
      updateProjectAutomation(session, {
        workspaceId: 'w1',
        projectId: 'p1',
        prOpenedStatusId: null,
        prMergedStatusId: 'foreign',
      }),
    ).rejects.toThrow(ValidationError);
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});
