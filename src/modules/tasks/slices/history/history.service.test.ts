import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';

type LastRow = {
  id: string;
  kind: string;
  actorId: string | null;
  viaTokenId: string | null;
  source: string | null;
  data: unknown;
  updatedAt: Date;
};

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const findLast = vi.fn<() => Promise<LastRow | null>>();
const create =
  vi.fn<(...args: unknown[]) => Promise<{ id: string; kind: string; updatedAt: Date }>>();
const updateData = vi.fn<(...args: unknown[]) => Promise<void>>();
const deleteEntry = vi.fn<(...args: unknown[]) => Promise<void>>();
const listForTask = vi.fn<(...args: unknown[]) => Promise<{ total: number; rows: unknown[] }>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  parseStatusColor: (value: string) => value,
}));
vi.mock('./history.repository', () => ({
  historyRepository: {
    findLast: () => findLast(),
    create: (...args: unknown[]) => create(...args),
    updateData: (...args: unknown[]) => updateData(...args),
    delete: (...args: unknown[]) => deleteEntry(...args),
    listForTask: (...args: unknown[]) => listForTask(...args),
  },
}));

const { historyAuthorOf, listTaskHistory, recordHistory } = await import('./history.service');

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
const now = new Date('2026-10-17T12:00:00Z');
const author = historyAuthorOf(session);
const tx = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  findLast.mockResolvedValue(null);
  create.mockImplementation((_tx, entry) =>
    Promise.resolve({ id: 'new', kind: (entry as { kind: string }).kind, updatedAt: now }),
  );
  requireWorkspaceAccess.mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'ws-1',
    memberId: 'm-1',
    role: 'member',
    permissions: { manageProjects: false, manageDocuments: false },
  });
});

const record = (changes: Parameters<typeof recordHistory>[1]['changes']) =>
  recordHistory(tx, { workspaceId: 'ws-1', taskId: TASK_ID, author, changes, now });

describe('recordHistory', () => {
  it('appends a new entry with the author', async () => {
    await record([{ kind: 'title', data: { from: 'A', to: 'B' } }]);
    expect(create).toHaveBeenCalledWith(tx, {
      actorId: 'user-1',
      viaTokenId: null,
      source: null,
      workspaceId: 'ws-1',
      taskId: TASK_ID,
      kind: 'title',
      data: { from: 'A', to: 'B' },
    });
  });

  it('merges a repeated edit of the same field', async () => {
    findLast.mockResolvedValue({
      id: 'prev',
      kind: 'title',
      ...author,
      data: { from: 'A', to: 'B' },
      updatedAt: new Date(now.getTime() - 30_000),
    });
    await record([{ kind: 'title', data: { from: 'B', to: 'C' } }]);
    expect(create).not.toHaveBeenCalled();
    expect(updateData).toHaveBeenCalledWith(tx, 'ws-1', 'prev', { from: 'A', to: 'C' });
  });

  it('deletes the entry when the value went back', async () => {
    findLast.mockResolvedValue({
      id: 'prev',
      kind: 'priority',
      ...author,
      data: { from: 'low', to: 'high' },
      updatedAt: new Date(now.getTime() - 30_000),
    });
    await record([{ kind: 'priority', data: { from: 'high', to: 'low' } }]);
    expect(deleteEntry).toHaveBeenCalledWith(tx, 'ws-1', 'prev');
    expect(create).not.toHaveBeenCalled();
  });

  it('does not merge an edit by another author', async () => {
    findLast.mockResolvedValue({
      id: 'prev',
      kind: 'title',
      actorId: 'user-2',
      viaTokenId: null,
      source: null,
      data: { from: 'A', to: 'B' },
      updatedAt: now,
    });
    await record([{ kind: 'title', data: { from: 'B', to: 'C' } }]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does nothing without changes', async () => {
    await record([]);
    expect(findLast).not.toHaveBeenCalled();
  });
});

describe('listTaskHistory', () => {
  it('maps rows, skips broken data and marks MCP edits', async () => {
    listForTask.mockResolvedValue({
      total: 2,
      rows: [
        {
          id: 'h1',
          kind: 'title',
          source: null,
          data: { from: 'A', to: 'B' },
          createdAt: now,
          updatedAt: now,
          actor: { id: 'user-1', name: 'Анна', image: null, isAgent: false },
          viaToken: { name: 'Ноутбук' },
        },
        {
          id: 'h2',
          kind: 'title',
          source: null,
          data: { broken: true },
          createdAt: now,
          updatedAt: now,
          actor: null,
          viaToken: null,
        },
      ],
    });
    const history = await listTaskHistory(session, 'ws-1', TASK_ID);
    expect(history.total).toBe(2);
    expect(history.items).toEqual([
      expect.objectContaining({
        id: 'h1',
        text: 'Название: «A» → «B»',
        actor: { userId: 'user-1', name: 'Анна', image: null, isAgent: false },
        via: { tokenName: 'Ноутбук' },
      }),
    ]);
  });

  it('returns nothing for a malformed id without a query', async () => {
    await expect(listTaskHistory(session, 'ws-1', 'x')).resolves.toEqual({ total: 0, items: [] });
    expect(listForTask).not.toHaveBeenCalled();
  });
});
