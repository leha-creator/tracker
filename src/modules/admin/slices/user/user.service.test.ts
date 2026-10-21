import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import { recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, ValidationError } from '@/shared/errors';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean | null;
  banExpires: Date | null;
  isAgent: boolean;
}

const requireAdmin = vi.fn<() => Promise<AuthSession>>();
const findById = vi.fn<(id: string) => Promise<UserRow | null>>();
const list = vi.fn();
const countWorkspacesByUsers = vi.fn<(ids: string[]) => Promise<Map<string, number>>>();
const listSoleOwnedWorkspaces =
  vi.fn<(userId: string) => Promise<{ id: string; name: string; slug: string }[]>>();
const banUserApi = vi.fn();
const unbanUserApi = vi.fn();
const setRoleApi = vi.fn();
const revokeUserSessionsApi = vi.fn();
const removeUserApi = vi.fn();
const deleteSession = vi.fn<(userId: string, sessionId: string) => Promise<boolean>>();
const resolveIdpSubjects = vi.fn<(actorId: string, userId: string) => Promise<unknown>>();
const callIdpAdmin = vi.fn<(subjects: unknown, action: unknown) => Promise<void>>();
const revokeApiTokenBySystem =
  vi.fn<(userId: string, tokenId: string) => Promise<{ name: string; revoked: boolean }>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireAdmin: () => requireAdmin(),
}));
vi.mock('@/modules/profiles', () => ({
  getProfileCards: vi.fn(),
}));
vi.mock('@/modules/workspaces', () => ({
  countWorkspacesByUsers: (ids: string[]) => countWorkspacesByUsers(ids),
  listSoleOwnedWorkspaces: (userId: string) => listSoleOwnedWorkspaces(userId),
  listUserMemberships: vi.fn(),
}));
vi.mock('@/modules/api-tokens', () => ({
  listUserApiTokensForAdmin: vi.fn(),
  revokeApiTokenBySystem: (userId: string, tokenId: string) =>
    revokeApiTokenBySystem(userId, tokenId),
}));
vi.mock('@/modules/auth', () => ({
  listUserSessionsBySystem: vi.fn(),
  revokeUserSessionBySystem: (userId: string, sessionId: string) =>
    deleteSession(userId, sessionId),
}));
vi.mock('@/modules/auth/client', () => ({
  describeUserAgent: () => ({ label: 'Неизвестное устройство' }),
}));
vi.mock('@/modules/integrations/github', () => ({ getGithubIdentity: vi.fn() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('./user.repository', () => ({
  userRepository: {
    findById: (id: string) => findById(id),
    list: (...args: unknown[]) => list(...args) as unknown,
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
  resolveIdpSubjects: (actorId: string, userId: string) => resolveIdpSubjects(actorId, userId),
  callIdpAdmin: (subjects: unknown, action: unknown) => callIdpAdmin(subjects, action),
  loadIdpAccountState: () => Promise.resolve(null),
}));

const {
  banUser,
  deleteUser,
  listAdminUsers,
  resendVerificationEmail,
  resetUserTwoFactor,
  revokeUserApiToken,
  revokeUserSession,
  revokeUserSessions,
  sendPasswordResetEmail,
  setUserRole,
  unbanUser,
  verifyUserEmail,
} = await import('./user.service');

const SUBJECTS = { actor: 'sub-admin', target: 'sub-user' };
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
    name: 'Борис',
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
  resolveIdpSubjects.mockResolvedValue(SUBJECTS);
  callIdpAdmin.mockResolvedValue();
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
  it('bans in IdP, then locally; the event is recorded by IdP', async () => {
    await banUser({ userId: 'user-2', reason: 'спам', duration: '7d' });
    expect(resolveIdpSubjects).toHaveBeenCalledWith('admin-1', 'user-2');
    expect(callIdpAdmin).toHaveBeenCalledWith(SUBJECTS, {
      kind: 'ban',
      banReason: 'спам',
      banExpiresIn: 604_800,
    });
    expect(banUserApi).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: 'user-2', banReason: 'спам', banExpiresIn: 604_800 },
      }),
    );
    expect(vi.mocked(recordAuditEvent)).not.toHaveBeenCalled();
  });

  it('does not ban locally when IdP refuses', async () => {
    callIdpAdmin.mockRejectedValueOnce(new ForbiddenError('Недостаточно прав'));
    await expect(banUser({ userId: 'user-2', reason: '', duration: '1d' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(banUserApi).not.toHaveBeenCalled();
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
    expect(callIdpAdmin).not.toHaveBeenCalled();
  });
});

describe('setUserRole', () => {
  it('changes the role in IdP and locally', async () => {
    await setUserRole({ userId: 'user-2', role: 'admin' });
    expect(callIdpAdmin).toHaveBeenCalledWith(SUBJECTS, { kind: 'role', role: 'admin' });
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
  it('call IdP and the plugin for the target user', async () => {
    await unbanUser({ userId: 'user-2' });
    await revokeUserSessions({ userId: 'user-2' });
    expect(callIdpAdmin).toHaveBeenCalledWith(SUBJECTS, { kind: 'unban' });
    expect(callIdpAdmin).toHaveBeenCalledWith(SUBJECTS, { kind: 'revokeSessions' });
    expect(unbanUserApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
    expect(revokeUserSessionsApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
  });

  it('stop when the user is not linked to IdP', async () => {
    resolveIdpSubjects.mockRejectedValueOnce(new ValidationError('не связан'));
    await expect(revokeUserSessions({ userId: 'user-2' })).rejects.toBeInstanceOf(ValidationError);
    expect(revokeUserSessionsApi).not.toHaveBeenCalled();
  });
});

describe('IdP-only account actions', () => {
  it('reset 2FA in IdP and end Tasker sessions', async () => {
    await resetUserTwoFactor({ userId: 'user-2' });
    expect(callIdpAdmin).toHaveBeenCalledWith(SUBJECTS, { kind: 'resetTwoFactor' });
    expect(revokeUserSessionsApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
  });

  it('verify email and send mails through IdP only', async () => {
    await verifyUserEmail({ userId: 'user-2' });
    await sendPasswordResetEmail({ userId: 'user-2' });
    await resendVerificationEmail({ userId: 'user-2' });
    expect(callIdpAdmin.mock.calls.map(([, action]) => action)).toEqual([
      { kind: 'verifyEmail' },
      { kind: 'sendPasswordReset' },
      { kind: 'sendVerification' },
    ]);
    expect(revokeUserSessionsApi).not.toHaveBeenCalled();
  });

  it('forbid acting on yourself', async () => {
    findById.mockResolvedValue(userRow({ id: 'admin-1' }));
    await expect(verifyUserEmail({ userId: 'admin-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(callIdpAdmin).not.toHaveBeenCalled();
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

  it('removes the user through the plugin', async () => {
    await deleteUser({ userId: 'user-2', confirmEmail: 'user@example.com' });
    expect(listSoleOwnedWorkspaces).toHaveBeenCalledWith('user-2');
    expect(removeUserApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
    // Строки пользователя уже нет — событие без ссылки на него.
    const event = vi.mocked(recordAuditEvent).mock.calls.at(-1)?.[0];
    expect(event).toMatchObject({ kind: 'admin.user_deleted', data: { userName: 'Борис' } });
    expect(event).not.toHaveProperty('targetUserId');
  });
});

describe('revokeUserSession', () => {
  it('deletes only the session of this user and records the event', async () => {
    deleteSession.mockResolvedValue(true);
    await revokeUserSession({ userId: 'user-2', sessionId: 'sess-9' });
    expect(deleteSession).toHaveBeenCalledWith('user-2', 'sess-9');
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'admin.user_session_revoked', targetUserId: 'user-2' }),
    );
  });

  it('returns NOT_FOUND for a session of another user', async () => {
    deleteSession.mockResolvedValue(false);
    await expect(
      revokeUserSession({ userId: 'user-2', sessionId: 'foreign' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(vi.mocked(recordAuditEvent)).not.toHaveBeenCalled();
  });

  it('hides agents', async () => {
    findById.mockResolvedValue(userRow({ isAgent: true }));
    await expect(revokeUserSession({ userId: 'agent-1', sessionId: 's' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(deleteSession).not.toHaveBeenCalled();
  });
});

describe('revokeUserApiToken', () => {
  const tokenId = '0190f2a4-0000-7000-8000-000000000001';

  it('revokes the token and records its name', async () => {
    revokeApiTokenBySystem.mockResolvedValue({ name: 'Ноутбук', revoked: true });
    await revokeUserApiToken({ userId: 'user-2', tokenId });
    expect(revokeApiTokenBySystem).toHaveBeenCalledWith('user-2', tokenId);
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'admin.user_token_revoked',
        data: { userName: 'Борис', tokenName: 'Ноутбук' },
      }),
    );
  });

  it('propagates NOT_FOUND for a token of another user', async () => {
    revokeApiTokenBySystem.mockRejectedValue(
      Object.assign(new Error('Токен не найден'), { code: 'NOT_FOUND' }),
    );
    await expect(revokeUserApiToken({ userId: 'user-2', tokenId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(vi.mocked(recordAuditEvent)).not.toHaveBeenCalled();
  });

  it('records nothing when the token was already revoked', async () => {
    revokeApiTokenBySystem.mockResolvedValue({ name: 'Ноутбук', revoked: false });
    await revokeUserApiToken({ userId: 'user-2', tokenId });
    expect(vi.mocked(recordAuditEvent)).not.toHaveBeenCalled();
  });
});
