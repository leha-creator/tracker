import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError } from '@/shared/errors';

type LabelRow = { id: string; name: string; nameKey: string; color: string };

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const requireWorkspacePermission = vi.fn<() => Promise<WorkspaceAccess>>();
const countInWorkspace = vi.fn<() => Promise<number>>();
const isNameTaken = vi.fn<() => Promise<boolean>>();
const createRow = vi.fn<(data: Omit<LabelRow, 'id'>) => Promise<LabelRow>>();
const deleteRow = vi.fn<() => Promise<number>>();
const findManyInWorkspace = vi.fn<() => Promise<LabelRow[]>>();
const listTaskLabels = vi.fn<() => Promise<LabelRow[]>>();
const replaceTaskLabels = vi.fn<(...args: unknown[]) => Promise<void>>();
const findByNameKeys = vi.fn<() => Promise<LabelRow[]>>();
const recordHistory = vi.fn<(...args: unknown[]) => Promise<void>>();

const assertTaskActive = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
vi.mock('../task/task-archive.guard', () => ({
  assertTaskActive: (...args: unknown[]) => assertTaskActive(...args),
}));
vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
  requireWorkspacePermission: () => requireWorkspacePermission(),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
  isUniqueViolation: () => false,
}));
vi.mock('../history/history.service', () => ({
  historyAuthorOf: (s: AuthSession) => ({ actorId: s.user.id, viaTokenId: null, source: null }),
  recordHistory: (...args: unknown[]) => recordHistory(...args),
}));
vi.mock('./label.repository', () => ({
  labelRepository: {
    countInWorkspace: () => countInWorkspace(),
    isNameTaken: () => isNameTaken(),
    create: (data: Omit<LabelRow, 'id'>) => createRow(data),
    delete: () => deleteRow(),
    findManyInWorkspace: () => findManyInWorkspace(),
    listTaskLabels: () => listTaskLabels(),
    replaceTaskLabels: (...args: unknown[]) => replaceTaskLabels(...args),
    findByNameKeys: () => findByNameKeys(),
  },
}));

const { createLabel, deleteLabel, ensureLabelsByNames, setTaskLabels } =
  await import('./label.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    image: null,
    role: 'user',
    banned: false,
    isAgent: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';
const L1 = '0192f3a0-0000-7000-8000-0000000000b1';
const L2 = '0192f3a0-0000-7000-8000-0000000000b2';
const bug: LabelRow = { id: L1, name: 'bug', nameKey: 'bug', color: 'red' };
const ui: LabelRow = { id: L2, name: 'ui', nameKey: 'ui', color: 'blue' };

beforeEach(() => {
  vi.clearAllMocks();
  const access = {
    userId: 'user-1',
    workspaceId: 'ws-1',
    memberId: 'm-1',
    role: 'member',
  } as WorkspaceAccess;
  requireWorkspaceAccess.mockResolvedValue(access);
  requireWorkspacePermission.mockResolvedValue(access);
  countInWorkspace.mockResolvedValue(0);
  isNameTaken.mockResolvedValue(false);
  createRow.mockImplementation((data) => Promise.resolve({ id: 'new', ...data }));
  listTaskLabels.mockResolvedValue([]);
});

describe('createLabel', () => {
  it('creates a label for any member with a normalized name', async () => {
    const label = await createLabel(session, {
      workspaceId: 'ws-1',
      name: '  Баг  ',
      color: 'red',
    });
    expect(createRow).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      name: 'Баг',
      nameKey: 'баг',
      color: 'red',
    });
    expect(label).toEqual({ id: 'new', name: 'Баг', color: 'red', tasksCount: 0 });
    expect(requireWorkspacePermission).not.toHaveBeenCalled();
  });

  it('rejects a taken name and the workspace limit', async () => {
    isNameTaken.mockResolvedValue(true);
    await expect(
      createLabel(session, { workspaceId: 'ws-1', name: 'bug', color: 'gray' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    countInWorkspace.mockResolvedValue(100);
    await expect(
      createLabel(session, { workspaceId: 'ws-1', name: 'new', color: 'gray' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('deleteLabel', () => {
  it('requires the manage projects permission', async () => {
    requireWorkspacePermission.mockRejectedValue(new ForbiddenError('Нет прав'));
    await expect(deleteLabel(session, { workspaceId: 'ws-1', labelId: L1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a label of another workspace', async () => {
    deleteRow.mockResolvedValue(0);
    await expect(deleteLabel(session, { workspaceId: 'ws-1', labelId: L1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('setTaskLabels', () => {
  const input = { workspaceId: 'ws-1', taskId: TASK_ID, labelIds: [L1, L2] };

  it('replaces labels and records the difference in history', async () => {
    listTaskLabels.mockResolvedValue([bug]);
    findManyInWorkspace.mockResolvedValue([bug, ui]);
    const labels = await setTaskLabels(session, { ...input, labelIds: [L1, L2, L1] });
    expect(replaceTaskLabels).toHaveBeenCalledWith(expect.anything(), 'ws-1', TASK_ID, [L1, L2]);
    expect(recordHistory.mock.calls[0]?.[1]).toMatchObject({
      changes: [{ kind: 'labels', data: { added: [{ id: L2, name: 'ui' }], removed: [] } }],
    });
    expect(labels.map((label) => label.name)).toEqual(['bug', 'ui']);
  });

  it('does nothing when labels are unchanged', async () => {
    listTaskLabels.mockResolvedValue([bug, ui]);
    findManyInWorkspace.mockResolvedValue([bug, ui]);
    await setTaskLabels(session, input);
    expect(replaceTaskLabels).not.toHaveBeenCalled();
    expect(recordHistory).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a label outside the workspace', async () => {
    findManyInWorkspace.mockResolvedValue([bug]);
    await expect(setTaskLabels(session, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(replaceTaskLabels).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a task outside the workspace', async () => {
    await expect(setTaskLabels(session, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects more labels than allowed', async () => {
    const many = Array.from(
      { length: 11 },
      (_, index) => `0192f3a0-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`,
    );
    await expect(setTaskLabels(session, { ...input, labelIds: many })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('ensureLabelsByNames', () => {
  it('reuses existing labels ignoring case and creates missing ones', async () => {
    findByNameKeys.mockResolvedValue([bug]);
    const result = await ensureLabelsByNames(session, 'ws-1', ['BUG', 'api', 'Api']);
    expect(result.created).toBe(1);
    expect(result.labels.map((label) => label.name)).toEqual(['bug', 'api']);
    expect(createRow).toHaveBeenCalledTimes(1);
  });
});
