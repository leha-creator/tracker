import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

const requireWorkspaceAccess = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const findByNumber = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const findByTitle = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: unknown[]) => requireWorkspaceAccess(...args),
}));
vi.mock('./search.repository', () => ({
  searchRepository: {
    findByNumber: (...args: unknown[]) => findByNumber(...args),
    findByTitle: (...args: unknown[]) => findByTitle(...args),
  },
}));

const { searchTasks } = await import('./search.service');

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

function row(id: string, number: number, placements = 0) {
  return {
    id,
    number,
    title: `Задача ${number}`,
    workspace: { taskKey: 'TSK' },
    placements:
      placements > 0
        ? [{ status: { name: 'В работе', category: 'in_progress' }, project: { name: 'Сайт' } }]
        : [],
    _count: { placements },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({});
  findByNumber.mockResolvedValue(null);
  findByTitle.mockResolvedValue([]);
});

describe('searchTasks', () => {
  it('проверяет доступ к пространству', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError('Пространство не найдено'));
    await expect(searchTasks(session, 'ws-x', 'доска', 5)).rejects.toThrow(NotFoundError);
    expect(findByTitle).not.toHaveBeenCalled();
  });

  it('пустой запрос — пусто без запросов к БД', async () => {
    expect(await searchTasks(session, 'ws-1', '  ', 5)).toEqual([]);
    expect(findByTitle).not.toHaveBeenCalled();
  });

  it('задача с номером — первой, остальные по названию без неё', async () => {
    findByNumber.mockResolvedValue(row('t-42', 42, 2));
    findByTitle.mockResolvedValue([row('t-420', 420)]);

    const result = await searchTasks(session, 'ws-1', 'TSK-42', 5);

    expect(findByNumber).toHaveBeenCalledWith('ws-1', 42);
    expect(findByTitle).toHaveBeenCalledWith('ws-1', 'TSK-42', 4, 't-42');
    expect(result.map((task) => task.key)).toEqual(['TSK-42', 'TSK-420']);
    expect(result[0]).toMatchObject({
      status: { name: 'В работе', category: 'in_progress', projectName: 'Сайт' },
      moreProjects: 1,
    });
    expect(result[1]).toMatchObject({ status: null, moreProjects: 0 });
  });

  it('текст без номера ищется только по названию', async () => {
    await searchTasks(session, 'ws-1', 'доска', 5);
    expect(findByNumber).not.toHaveBeenCalled();
    expect(findByTitle).toHaveBeenCalledWith('ws-1', 'доска', 5, undefined);
  });
});
