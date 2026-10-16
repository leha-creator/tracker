import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

const requireWorkspaceAccess =
  vi.fn<(session: AuthSession, ws: string, role?: string) => Promise<WorkspaceAccess>>();
const create = vi.fn<(data: Record<string, unknown>) => Promise<void>>();
const deleteOlderThan = vi.fn<(before: Date) => Promise<number>>();
const listForUser = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const listForToken = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const findToken = vi.fn<(tokenId: string) => Promise<unknown>>();
const findAgent =
  vi.fn<(agentId: string) => Promise<{ userId: string; workspaceId: string } | null>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('./activity.repository', () => ({
  activityRepository: { create, deleteOlderThan, listForUser, listForToken, findToken },
}));
vi.mock('../token/token.repository', () => ({ apiTokenRepository: { findAgent } }));

const { listAgentActivity, listTokenActivity, recordActivity } = await import('./activity.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'a@example.com',
    name: 'Анна',
    image: null,
    role: 'user',
    banned: false,
    isAgent: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

function row(index: number) {
  return {
    id: `0199e5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
    tool: 'add_comment',
    summary: `Прокомментировал TSK-${index}`,
    targetKey: `TSK-${index}`,
    createdAt: new Date(Date.UTC(2026, 9, 17, 0, 0, 100 - index)),
    token: { name: 'Ноутбук' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({} as WorkspaceAccess);
  findAgent.mockResolvedValue({ userId: 'agent-1', workspaceId: 'ws-1' });
  listForUser.mockResolvedValue([]);
  listForToken.mockResolvedValue([]);
});

describe('recordActivity', () => {
  it('never throws when the write fails', async () => {
    create.mockRejectedValue(new Error('db down'));
    await expect(
      recordActivity({
        workspaceId: 'ws-1',
        userId: 'agent-1',
        tokenId: 'tok-1',
        tool: 'add_comment',
        summary: 's',
        targetKey: null,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('listAgentActivity', () => {
  it('is for the workspace owner only', async () => {
    requireWorkspaceAccess.mockRejectedValue(new ForbiddenError());
    await expect(listAgentActivity(session, 'ws-1', 'agent-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(session, 'ws-1', 'owner');
    expect(listForUser).not.toHaveBeenCalled();
  });

  it('hides an agent of another workspace', async () => {
    findAgent.mockResolvedValue({ userId: 'agent-1', workspaceId: 'ws-2' });
    await expect(listAgentActivity(session, 'ws-1', 'agent-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('pages by 50 with a cursor of the last item', async () => {
    listForUser.mockResolvedValue(Array.from({ length: 51 }, (_, index) => row(index + 1)));
    const page = await listAgentActivity(session, 'ws-1', 'agent-1');
    expect(listForUser).toHaveBeenCalledWith('ws-1', 'agent-1', null, 51);
    expect(page.items).toHaveLength(50);
    expect(page.items[0]).toMatchObject({ tokenName: 'Ноутбук', targetKey: 'TSK-1' });
    expect(page.nextCursor).toBe(`${row(50).createdAt.toISOString()}_${row(50).id}`);
  });
});

describe('listTokenActivity', () => {
  it('only the token owner reads its journal', async () => {
    findToken.mockResolvedValue({ id: 'tok-1', name: 'T', userId: 'someone-else' });
    await expect(listTokenActivity(session, 'tok-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(listForToken).not.toHaveBeenCalled();
  });

  it('returns the token and its page', async () => {
    findToken.mockResolvedValue({
      id: 'tok-1',
      name: 'Ноутбук',
      userId: 'user-1',
      workspace: { id: 'ws-1', slug: 'team', name: 'Команда' },
    });
    listForToken.mockResolvedValue([row(1)]);
    const result = await listTokenActivity(session, 'tok-1');
    expect(result.token.name).toBe('Ноутбук');
    expect(result.page).toMatchObject({
      nextCursor: null,
      items: [{ summary: 'Прокомментировал TSK-1' }],
    });
  });
});
