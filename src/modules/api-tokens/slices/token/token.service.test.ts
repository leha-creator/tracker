import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError, UnauthorizedError, ValidationError } from '@/shared/errors';

import { generateApiToken, hashApiToken } from '../../models';

const requireWorkspaceAccess =
  vi.fn<(session: AuthSession, ws: string) => Promise<WorkspaceAccess>>();
const countActive = vi.fn<(userId: string, now: Date) => Promise<number>>();
const create = vi.fn<(data: Record<string, unknown>) => Promise<ReturnType<typeof tokenRow>>>();
const findOwned =
  vi.fn<
    (
      userId: string,
      tokenId: string,
    ) => Promise<{ id: string; workspaceId: string; revokedAt: Date | null } | null>
  >();
const revoke = vi.fn<(tokenId: string, now: Date) => Promise<boolean>>();
const findByHash = vi.fn<(hash: string) => Promise<ReturnType<typeof authRow> | null>>();
const touch = vi.fn<(tokenId: string, now: Date, before: Date) => Promise<void>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('./token.repository', () => ({
  apiTokenRepository: {
    countActive: (userId: string, now: Date) => countActive(userId, now),
    create: (data: Record<string, unknown>) => create(data),
    findOwned: (userId: string, tokenId: string) => findOwned(userId, tokenId),
    revoke: (tokenId: string, now: Date) => revoke(tokenId, now),
    findByHash: (hash: string) => findByHash(hash),
    touch: (tokenId: string, now: Date, before: Date) => touch(tokenId, now, before),
  },
}));

const { authenticateApiToken, createApiToken, revokeApiToken } = await import('./token.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'a@example.com',
    name: 'Анна',
    image: null,
    role: 'admin',
    banned: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

const access: WorkspaceAccess = {
  userId: 'user-1',
  workspaceId: 'ws-1',
  memberId: 'm-1',
  role: 'member',
  permissions: { manageProjects: false, manageDocuments: false },
};

function tokenRow() {
  return {
    id: 'tok-1',
    name: 'Claude Code',
    prefix: 'tkr_abcdefgh',
    createdAt: new Date('2026-10-16'),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    workspace: { id: 'ws-1', slug: 'ws', name: 'Пространство' },
  };
}

function authRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    prefix: 'tkr_abcdefgh',
    expiresAt: null as Date | null,
    revokedAt: null as Date | null,
    lastUsedAt: null as Date | null,
    user: {
      id: 'user-1',
      email: 'a@example.com',
      name: 'Анна',
      image: null,
      banned: false as boolean | null,
      banExpires: null as Date | null,
    },
    workspace: { id: 'ws-1', slug: 'ws', name: 'Пространство', taskKey: 'TSK' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue(access);
  countActive.mockResolvedValue(0);
  create.mockResolvedValue(tokenRow());
  revoke.mockResolvedValue(true);
  touch.mockResolvedValue();
});

describe('createApiToken', () => {
  it('проверяет членство, хранит только хеш и возвращает токен один раз', async () => {
    const result = await createApiToken(session, {
      name: 'Claude Code',
      workspaceId: 'ws-1',
      expiry: 'never',
    });

    expect(requireWorkspaceAccess).toHaveBeenCalledWith(session, 'ws-1');
    const data = create.mock.calls[0]![0];
    expect(data).toMatchObject({ userId: 'user-1', workspaceId: 'ws-1', expiresAt: null });
    expect(data.tokenHash).toBe(hashApiToken(result.secret));
    expect(data).not.toHaveProperty('token');
    expect(result.secret.startsWith(data.prefix as string)).toBe(true);
    expect(result.token.state).toBe('active');
  });

  it('отказывает сверх лимита действующих токенов', async () => {
    countActive.mockResolvedValue(20);
    await expect(
      createApiToken(session, { name: 'x', workspaceId: 'ws-1', expiry: '30d' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(create).not.toHaveBeenCalled();
  });

  it('неучастнику пространства не выпускает', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError());
    await expect(
      createApiToken(session, { name: 'x', workspaceId: 'ws-2', expiry: '30d' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('revokeApiToken', () => {
  it('чужой или несуществующий токен — NOT_FOUND', async () => {
    findOwned.mockResolvedValue(null);
    await expect(revokeApiToken(session, 'tok-x')).rejects.toBeInstanceOf(NotFoundError);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('повторный отзыв ничего не меняет', async () => {
    findOwned.mockResolvedValue({ id: 'tok-1', workspaceId: 'ws-1', revokedAt: new Date() });
    await revokeApiToken(session, 'tok-1');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('отзывает свой токен', async () => {
    findOwned.mockResolvedValue({ id: 'tok-1', workspaceId: 'ws-1', revokedAt: null });
    await revokeApiToken(session, 'tok-1');
    expect(revoke).toHaveBeenCalledWith('tok-1', expect.any(Date));
  });
});

describe('authenticateApiToken', () => {
  const { token } = generateApiToken();
  const header = `Bearer ${token}`;

  it('строит сессию владельца с ролью user и пространством токена', async () => {
    findByHash.mockResolvedValue(authRow());
    const ctx = await authenticateApiToken(header);

    expect(findByHash).toHaveBeenCalledWith(hashApiToken(token));
    expect(ctx.session.user).toMatchObject({ id: 'user-1', role: 'user', banned: false });
    expect(ctx.session.session.id).toBe('api-token:tok-1');
    expect(ctx.workspace).toEqual({ id: 'ws-1', slug: 'ws', name: 'Пространство', taskKey: 'TSK' });
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(ctx.session, 'ws-1');
    expect(touch).toHaveBeenCalledOnce();
  });

  it('не обновляет lastUsedAt чаще раза в минуту', async () => {
    findByHash.mockResolvedValue(authRow({ lastUsedAt: new Date(Date.now() - 1000) }));
    await authenticateApiToken(header);
    expect(touch).not.toHaveBeenCalled();
  });

  it.each([
    ['нет заголовка', null, undefined],
    ['другая схема', `Basic ${token}`, undefined],
    ['неизвестный токен', header, null],
    ['отозван', header, authRow({ revokedAt: new Date() })],
    ['истёк', header, authRow({ expiresAt: new Date(Date.now() - 1) })],
    [
      'пользователь заблокирован',
      header,
      authRow({ user: { ...authRow().user, banned: true, banExpires: null } }),
    ],
  ])('%s → UNAUTHORIZED', async (_name, value, row) => {
    findByHash.mockResolvedValue(row ?? null);
    await expect(authenticateApiToken(value)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(touch).not.toHaveBeenCalled();
  });

  it('истёкшая блокировка не мешает', async () => {
    findByHash.mockResolvedValue(
      authRow({ user: { ...authRow().user, banned: true, banExpires: new Date(Date.now() - 1) } }),
    );
    await expect(authenticateApiToken(header)).resolves.toMatchObject({ tokenId: 'tok-1' });
  });

  it('вышел из пространства → UNAUTHORIZED', async () => {
    findByHash.mockResolvedValue(authRow());
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError());
    await expect(authenticateApiToken(header)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
