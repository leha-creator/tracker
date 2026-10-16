import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, ValidationError } from '@/shared/errors';

interface UserRow {
  id: string;
  email: string;
  role: string;
  banned: boolean | null;
  banExpires: Date | null;
  isAgent: boolean;
  twoFactorEnabled?: boolean;
}

const requireAdmin = vi.fn<() => Promise<AuthSession>>();
const findById = vi.fn<(id: string) => Promise<UserRow | null>>();
const list = vi.fn();
const resetTwoFactor = vi.fn<(id: string) => Promise<void>>();
const countWorkspacesByUsers = vi.fn<(ids: string[]) => Promise<Map<string, number>>>();
const listSoleOwnedWorkspaces =
  vi.fn<(userId: string) => Promise<{ id: string; name: string; slug: string }[]>>();
const banUserApi = vi.fn();
const unbanUserApi = vi.fn();
const setRoleApi = vi.fn();
const revokeUserSessionsApi = vi.fn();
const removeUserApi = vi.fn();
const cleanupAvatar = vi.fn<() => Promise<void>>();
const prepareAvatarCleanup = vi.fn<(userId: string) => Promise<() => Promise<void>>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireAdmin: () => requireAdmin(),
}));
vi.mock('@/modules/profiles', () => ({
  prepareAvatarCleanup: (userId: string) => prepareAvatarCleanup(userId),
}));
vi.mock('@/modules/workspaces', () => ({
  countWorkspacesByUsers: (ids: string[]) => countWorkspacesByUsers(ids),
  listSoleOwnedWorkspaces: (userId: string) => listSoleOwnedWorkspaces(userId),
}));
vi.mock('./user.repository', () => ({
  userRepository: {
    findById: (id: string) => findById(id),
    list: (...args: unknown[]) => list(...args) as unknown,
    resetTwoFactor: (id: string) => resetTwoFactor(id),
  },
}));
vi.mock('../../admin-api', () => ({
  callAdminApi: (call: (api: unknown, headers: Headers) => Promise<unknown>) =>
    call(
      {
        banUser: banUserApi,
        unbanUser: unbanUserApi,
        setRole: setRoleApi,
        revokeUserSessions: revokeUserSessionsApi,
        removeUser: removeUserApi,
      },
      new Headers(),
    ),
}));

const {
  banUser,
  deleteUser,
  listAdminUsers,
  resetUserTwoFactor,
  revokeUserSessions,
  setUserRole,
  unbanUser,
} = await import('./user.service');
const { defaultAdminUserListQuery } = await import('../../models');

const adminSession: AuthSession = {
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    image: null,
    role: 'admin',
    banned: false,
    isAgent: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-2',
    email: 'user@example.com',
    role: 'user',
    banned: false,
    banExpires: null,
    isAgent: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(adminSession);
  findById.mockResolvedValue(userRow());
  listSoleOwnedWorkspaces.mockResolvedValue([]);
});

describe('access', () => {
  it('rejects non-admins before touching data', async () => {
    requireAdmin.mockRejectedValue(new ForbiddenError());
    await expect(banUser({ userId: 'user-2', reason: '', duration: '1d' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(listAdminUsers(defaultAdminUserListQuery())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(findById).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('hides agents from admin actions', async () => {
    findById.mockResolvedValue(userRow({ isAgent: true }));
    await expect(unbanUser({ userId: 'agent-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(unbanUserApi).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for unknown user', async () => {
    findById.mockResolvedValue(null);
    await expect(unbanUser({ userId: 'ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(unbanUserApi).not.toHaveBeenCalled();
  });

  it.each([
    ['ban', () => banUser({ userId: 'admin-1', reason: '', duration: '1d' })],
    ['setRole', () => setUserRole({ userId: 'admin-1', role: 'user' })],
    ['revokeSessions', () => revokeUserSessions({ userId: 'admin-1' })],
    ['delete', () => deleteUser({ userId: 'admin-1', confirmEmail: 'admin@example.com' })],
  ])('forbids %s on yourself', async (_name, run) => {
    findById.mockResolvedValue(
      userRow({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }),
    );
    await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('listAdminUsers', () => {
  it('maps rows with workspaces count, ban state and current-user flag', async () => {
    const created = new Date('2026-01-01');
    list.mockResolvedValue({
      total: 51,
      rows: [
        {
          id: 'admin-1',
          name: 'Admin',
          email: 'admin@example.com',
          image: null,
          role: 'admin',
          banned: false,
          banReason: null,
          banExpires: null,
          createdAt: created,
        },
        {
          id: 'user-2',
          name: 'User',
          email: 'user@example.com',
          image: null,
          role: 'user',
          banned: true,
          banReason: 'спам',
          banExpires: null,
          createdAt: created,
        },
      ],
    });
    countWorkspacesByUsers.mockResolvedValue(new Map([['user-2', 2]]));

    const result = await listAdminUsers(defaultAdminUserListQuery());

    expect(countWorkspacesByUsers).toHaveBeenCalledWith(['admin-1', 'user-2']);
    expect(result).toMatchObject({ total: 51, page: 1, pageCount: 2 });
    expect(result.items[0]).toMatchObject({
      role: 'admin',
      isCurrentUser: true,
      workspacesCount: 0,
      ban: { kind: 'active' },
    });
    expect(result.items[1]).toMatchObject({
      isCurrentUser: false,
      workspacesCount: 2,
      ban: { kind: 'banned', until: null, reason: 'спам' },
    });
  });
});

describe('banUser', () => {
  it('passes reason and duration in seconds to the plugin', async () => {
    await banUser({ userId: 'user-2', reason: 'спам', duration: '7d' });
    expect(banUserApi).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: 'user-2', banReason: 'спам', banExpiresIn: 604_800 },
      }),
    );
  });

  it('sends no reason or expiry for an empty reason and forever ban', async () => {
    await banUser({ userId: 'user-2', reason: '', duration: 'forever' });
    expect(banUserApi).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: 'user-2', banReason: undefined, banExpiresIn: undefined },
      }),
    );
  });

  it('forbids banning an admin', async () => {
    findById.mockResolvedValue(userRow({ role: 'admin' }));
    await expect(banUser({ userId: 'user-2', reason: '', duration: '1d' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(banUserApi).not.toHaveBeenCalled();
  });
});

describe('setUserRole', () => {
  it('changes the role through the plugin', async () => {
    await setUserRole({ userId: 'user-2', role: 'admin' });
    expect(setRoleApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2', role: 'admin' } }),
    );
  });

  it('rejects the same role', async () => {
    await expect(setUserRole({ userId: 'user-2', role: 'user' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(setRoleApi).not.toHaveBeenCalled();
  });
});

describe('unbanUser and revokeUserSessions', () => {
  it('call the plugin for the target user', async () => {
    await unbanUser({ userId: 'user-2' });
    await revokeUserSessions({ userId: 'user-2' });
    expect(unbanUserApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
    expect(revokeUserSessionsApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
  });
});

describe('deleteUser', () => {
  it('requires the matching email', async () => {
    await expect(
      deleteUser({ userId: 'user-2', confirmEmail: 'other@example.com' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: { confirmEmail: expect.any(Array) },
    });
    expect(removeUserApi).not.toHaveBeenCalled();
  });

  it('refuses to delete a sole owner and names the workspaces', async () => {
    listSoleOwnedWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Альфа', slug: 'alfa' }]);
    await expect(
      deleteUser({ userId: 'user-2', confirmEmail: 'USER@example.com' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('«Альфа»') });
    expect(removeUserApi).not.toHaveBeenCalled();
  });

  it('forbids deleting an admin', async () => {
    findById.mockResolvedValue(userRow({ role: 'admin' }));
    await expect(
      deleteUser({ userId: 'user-2', confirmEmail: 'user@example.com' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('removes the user through the plugin and then the avatar', async () => {
    prepareAvatarCleanup.mockResolvedValue(cleanupAvatar);
    removeUserApi.mockImplementation(() => {
      expect(cleanupAvatar).not.toHaveBeenCalled();
      return Promise.resolve();
    });
    await deleteUser({ userId: 'user-2', confirmEmail: 'user@example.com' });
    expect(listSoleOwnedWorkspaces).toHaveBeenCalledWith('user-2');
    expect(removeUserApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
    expect(prepareAvatarCleanup).toHaveBeenCalledWith('user-2');
    expect(cleanupAvatar).toHaveBeenCalledTimes(1);
  });
});

describe('resetUserTwoFactor', () => {
  beforeEach(() => {
    requireAdmin.mockResolvedValue(adminSession);
    resetTwoFactor.mockReset().mockResolvedValue();
    revokeUserSessionsApi.mockReset().mockResolvedValue({ success: true });
  });

  it('rejects non-admins', async () => {
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    await expect(resetUserTwoFactor({ userId: 'user-2' })).rejects.toBeInstanceOf(ForbiddenError);
    expect(resetTwoFactor).not.toHaveBeenCalled();
  });

  it('rejects acting on yourself', async () => {
    findById.mockResolvedValue(userRow({ id: 'admin-1', twoFactorEnabled: true }));
    await expect(resetUserTwoFactor({ userId: 'admin-1' })).rejects.toBeInstanceOf(ForbiddenError);
    expect(resetTwoFactor).not.toHaveBeenCalled();
  });

  it('rejects when 2FA is off', async () => {
    findById.mockResolvedValue(userRow({ twoFactorEnabled: false }));
    await expect(resetUserTwoFactor({ userId: 'user-2' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('resets 2FA and revokes sessions', async () => {
    findById.mockResolvedValue(userRow({ twoFactorEnabled: true }));
    await resetUserTwoFactor({ userId: 'user-2' });
    expect(resetTwoFactor).toHaveBeenCalledWith('user-2');
    expect(revokeUserSessionsApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
  });
});
