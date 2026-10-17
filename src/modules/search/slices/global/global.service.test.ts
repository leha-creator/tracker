import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

const searchTasks = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const searchDocuments = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const listMembers = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const listMyWorkspaces = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();

vi.mock('@/modules/tasks', () => ({
  searchTasks: (...args: unknown[]) => searchTasks(...args),
}));
vi.mock('@/modules/documents', () => ({
  searchDocuments: (...args: unknown[]) => searchDocuments(...args),
}));
vi.mock('@/modules/workspaces', () => ({
  listMembers: (...args: unknown[]) => listMembers(...args),
  listMyWorkspaces: (...args: unknown[]) => listMyWorkspaces(...args),
}));

const { globalSearch } = await import('./global.service');

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

function member(name: string, email: string) {
  return { userId: `id-${name}`, name, email, image: null, isAgent: false, role: 'member' };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchTasks.mockResolvedValue([]);
  searchDocuments.mockResolvedValue([]);
  listMembers.mockResolvedValue([]);
  listMyWorkspaces.mockResolvedValue([]);
});

describe('globalSearch', () => {
  it('короткий запрос ничего не ищет', async () => {
    const result = await globalSearch(session, { workspaceId: 'ws-1', q: 'а' });
    expect(result).toEqual({ tasks: [], documents: [], members: [], workspaces: [] });
    expect(searchTasks).not.toHaveBeenCalled();
    expect(listMyWorkspaces).not.toHaveBeenCalled();
  });

  it('номер задачи из одной цифры ищется', async () => {
    await globalSearch(session, { workspaceId: 'ws-1', q: '7' });
    expect(searchTasks).toHaveBeenCalledWith(session, 'ws-1', '7', 5);
  });

  it('в пространстве ищет задачи, документы и участников этого пространства', async () => {
    searchTasks.mockResolvedValue([{ number: 1 }]);
    searchDocuments.mockResolvedValue([{ id: 'd' }]);
    listMembers.mockResolvedValue([
      member('Анна', 'anna@example.com'),
      member('Борис', 'boris@example.com'),
    ]);

    const result = await globalSearch(session, { workspaceId: 'ws-1', q: 'ан' });

    expect(searchTasks).toHaveBeenCalledWith(session, 'ws-1', 'ан', 5);
    expect(searchDocuments).toHaveBeenCalledWith(session, 'ws-1', 'ан', 5);
    expect(listMembers).toHaveBeenCalledWith(session, 'ws-1');
    expect(result.tasks).toHaveLength(1);
    expect(result.documents).toHaveLength(1);
    expect(result.members).toEqual([
      { userId: 'id-Анна', name: 'Анна', email: 'anna@example.com', image: null, isAgent: false },
    ]);
    expect(result.workspaces).toEqual([]);
    expect(listMyWorkspaces).not.toHaveBeenCalled();
  });

  it('участников не больше лимита группы', async () => {
    listMembers.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => member(`Участник ${i}`, `u${i}@example.com`)),
    );
    const result = await globalSearch(session, { workspaceId: 'ws-1', q: 'участник' });
    expect(result.members).toHaveLength(5);
  });

  it('чужое или архивное пространство — NOT_FOUND от проверки доступа групп', async () => {
    searchTasks.mockRejectedValue(new NotFoundError('Пространство не найдено'));
    await expect(globalSearch(session, { workspaceId: 'ws-x', q: 'доска' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('вне пространства ищет только пространства пользователя', async () => {
    listMyWorkspaces.mockResolvedValue([
      { id: 'w1', slug: 'design', name: 'Дизайн', icon: 'rocket', role: 'owner' },
      { id: 'w2', slug: 'dev', name: 'Разработка', icon: 'code', role: 'member' },
    ]);

    const result = await globalSearch(session, { workspaceId: null, q: 'диз' });

    expect(result.workspaces).toEqual([
      { id: 'w1', slug: 'design', name: 'Дизайн', icon: 'rocket' },
    ]);
    expect(searchTasks).not.toHaveBeenCalled();
    expect(searchDocuments).not.toHaveBeenCalled();
    expect(listMembers).not.toHaveBeenCalled();
  });
});
