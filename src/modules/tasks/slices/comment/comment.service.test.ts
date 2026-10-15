import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess, WorkspaceRole } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

const requireWorkspaceAccess =
  vi.fn<(session: AuthSession, ws: string) => Promise<WorkspaceAccess>>();
const taskExists = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const listForTask =
  vi.fn<(...args: unknown[]) => Promise<{ total: number; rows: ReturnType<typeof row>[] }>>();
const find = vi.fn<(...args: unknown[]) => Promise<ReturnType<typeof row> | null>>();
const create = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>();
const updateBody = vi.fn<(...args: unknown[]) => Promise<number>>();
const deleteRow = vi.fn<(...args: unknown[]) => Promise<number>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  parseStatusColor: (value: string) => value,
}));
vi.mock('./comment.repository', () => ({
  commentRepository: {
    taskExists: (...args: unknown[]) => taskExists(...args),
    listForTask: (...args: unknown[]) => listForTask(...args),
    find: (...args: unknown[]) => find(...args),
    create: (...args: unknown[]) => create(...args),
    updateBody: (...args: unknown[]) => updateBody(...args),
    delete: (...args: unknown[]) => deleteRow(...args),
  },
}));

const { createComment, deleteComment, listTaskComments, updateComment } =
  await import('./comment.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    image: null,
    role: 'user',
    banned: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';
const COMMENT_ID = '0192f3a0-0000-7000-8000-0000000000c1';
const KEY = { workspaceId: 'ws-1', taskId: TASK_ID, commentId: COMMENT_ID };

function row(overrides: Partial<{ id: string; body: string; authorId: string | null }> = {}) {
  const authorId = overrides.authorId === undefined ? 'user-1' : overrides.authorId;
  return {
    id: overrides.id ?? COMMENT_ID,
    body: overrides.body ?? 'Текст',
    authorId,
    createdAt: new Date('2026-10-16T10:00:00.000Z'),
    editedAt: null,
    author: authorId ? { id: authorId, name: 'Author', image: null } : null,
  };
}

function accessAs(role: WorkspaceRole) {
  requireWorkspaceAccess.mockImplementation((_session, workspaceId) =>
    Promise.resolve({
      userId: session.user.id,
      workspaceId,
      memberId: 'm-1',
      role,
      permissions: { manageProjects: role === 'owner' },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  accessAs('member');
  taskExists.mockResolvedValue(true);
  listForTask.mockResolvedValue({ total: 0, rows: [] });
  find.mockResolvedValue(row());
  create.mockResolvedValue({ id: COMMENT_ID });
  updateBody.mockResolvedValue(1);
  deleteRow.mockResolvedValue(1);
});

describe('listTaskComments', () => {
  it('returns NOT_FOUND for a non-member', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError('Пространство не найдено'));
    await expect(listTaskComments(session, 'ws-1', TASK_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(listForTask).not.toHaveBeenCalled();
  });

  it('returns the latest page oldest-first with permission flags', async () => {
    listForTask.mockResolvedValue({
      total: 60,
      rows: [row({ id: 'c2', authorId: 'someone' }), row({ id: 'c1' })],
    });
    const result = await listTaskComments(session, 'ws-1', TASK_ID);
    expect(listForTask).toHaveBeenCalledWith('ws-1', TASK_ID, 50);
    expect(result.total).toBe(60);
    expect(result.truncated).toBe(true);
    expect(result.items.map((item) => [item.id, item.canEdit, item.canDelete])).toEqual([
      ['c1', true, true],
      ['c2', false, false],
    ]);
    expect(result.items[0]?.author).toEqual({ userId: 'user-1', name: 'Author', image: null });
  });

  it('loads all comments without a limit', async () => {
    listForTask.mockResolvedValue({ total: 1, rows: [row()] });
    const result = await listTaskComments(session, 'ws-1', TASK_ID, { all: true });
    expect(listForTask).toHaveBeenCalledWith('ws-1', TASK_ID, undefined);
    expect(result.truncated).toBe(false);
  });

  it('rejects a malformed task id without a query', async () => {
    await expect(listTaskComments(session, 'ws-1', 'abc')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(listForTask).not.toHaveBeenCalled();
  });
});

describe('createComment', () => {
  it('returns NOT_FOUND for a task of another workspace', async () => {
    taskExists.mockResolvedValue(false);
    await expect(
      createComment(session, { workspaceId: 'ws-1', taskId: TASK_ID, body: 'a' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a comment authored by the current user', async () => {
    await expect(
      createComment(session, { workspaceId: 'ws-1', taskId: TASK_ID, body: 'Привет' }),
    ).resolves.toEqual({ commentId: COMMENT_ID });
    expect(create).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      taskId: TASK_ID,
      authorId: 'user-1',
      body: 'Привет',
    });
  });
});

describe('updateComment', () => {
  it('returns NOT_FOUND for a comment of another task', async () => {
    find.mockResolvedValue(null);
    await expect(updateComment(session, { ...KEY, body: 'b' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(find).toHaveBeenCalledWith(KEY);
    expect(updateBody).not.toHaveBeenCalled();
  });

  it('forbids editing a foreign comment, even for the owner', async () => {
    accessAs('owner');
    find.mockResolvedValue(row({ authorId: 'someone' }));
    await expect(updateComment(session, { ...KEY, body: 'b' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(updateBody).not.toHaveBeenCalled();
  });

  it('updates the text of own comment', async () => {
    await updateComment(session, { ...KEY, body: 'Новый текст' });
    expect(updateBody).toHaveBeenCalledWith(KEY, 'Новый текст');
  });

  it('skips the update when the text is unchanged', async () => {
    await updateComment(session, { ...KEY, body: 'Текст' });
    expect(updateBody).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the comment disappeared', async () => {
    updateBody.mockResolvedValue(0);
    await expect(updateComment(session, { ...KEY, body: 'b' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('deleteComment', () => {
  it('forbids a member to delete a foreign comment', async () => {
    find.mockResolvedValue(row({ authorId: 'someone' }));
    await expect(deleteComment(session, KEY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('lets the owner delete a foreign comment', async () => {
    accessAs('owner');
    find.mockResolvedValue(row({ authorId: null }));
    await deleteComment(session, KEY);
    expect(deleteRow).toHaveBeenCalledWith(KEY);
  });

  it('rejects a malformed comment id without a query', async () => {
    await expect(deleteComment(session, { ...KEY, commentId: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(find).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the comment disappeared', async () => {
    deleteRow.mockResolvedValue(0);
    await expect(deleteComment(session, KEY)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
