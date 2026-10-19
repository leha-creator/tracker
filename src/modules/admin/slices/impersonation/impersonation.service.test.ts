import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import { recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';

interface UserRow {
  id: string;
  name: string;
  role: string;
  banned: boolean | null;
  banExpires: Date | null;
  isAgent: boolean;
}

const requireAdmin = vi.fn<() => Promise<AuthSession>>();
const requireUser = vi.fn<() => Promise<AuthSession>>();
const getSession = vi.fn<() => Promise<AuthSession | null>>();
const findById = vi.fn<(id: string) => Promise<UserRow | null>>();
const impersonateUserApi = vi.fn();
const stopImpersonatingApi = vi.fn();
const enforceRateLimit = vi.fn<(action: string, subject: unknown) => Promise<void>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireAdmin: () => requireAdmin(),
  requireUser: () => requireUser(),
}));
vi.mock('@/shared/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/shared/rate-limit', () => ({
  enforceRateLimit: (action: string, subject: unknown) => enforceRateLimit(action, subject),
  getClientIp: () => '203.0.113.1',
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('../user/user.repository', () => ({
  userRepository: { findById: (id: string) => findById(id) },
}));
vi.mock('../../admin-api', () => ({
  callAdminApi: (call: (api: unknown, headers: Headers) => Promise<unknown>) =>
    call(
      { impersonateUser: impersonateUserApi, stopImpersonating: stopImpersonatingApi },
      new Headers(),
    ),
}));

const { getMyImpersonation, startImpersonation, stopImpersonation } =
  await import('./impersonation.service');

function sessionOf(
  user: Partial<AuthSession['user']>,
  impersonatedBy: string | null = null,
): AuthSession {
  return {
    user: {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Админ',
      image: null,
      role: 'admin',
      banned: false,
      isAgent: false,
      ...user,
    },
    session: { id: 's-1', expiresAt: new Date('2030-01-01T10:00:00Z'), impersonatedBy },
  };
}

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-2',
    name: 'Борис',
    role: 'user',
    banned: false,
    banExpires: null,
    isAgent: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(sessionOf({}));
  findById.mockResolvedValue(userRow());
  enforceRateLimit.mockResolvedValue();
});

describe('startImpersonation', () => {
  it('impersonates through the plugin and records the event', async () => {
    await startImpersonation({ userId: 'user-2' });
    expect(enforceRateLimit).toHaveBeenCalledWith(
      'admin-impersonate',
      expect.objectContaining({ userId: 'admin-1' }),
    );
    expect(impersonateUserApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'user-2' } }),
    );
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'admin.impersonation_started',
        targetUserId: 'user-2',
        actor: expect.objectContaining({ actorId: 'admin-1' }) as unknown,
      }),
    );
  });

  it('rejects an admin target before the plugin call', async () => {
    findById.mockResolvedValue(userRow({ role: 'admin' }));
    await expect(startImpersonation({ userId: 'user-2' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(impersonateUserApi).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it('rejects a currently banned user but allows an expired ban', async () => {
    findById.mockResolvedValue(userRow({ banned: true, banExpires: null }));
    await expect(startImpersonation({ userId: 'user-2' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    findById.mockResolvedValue(userRow({ banned: true, banExpires: new Date('2000-01-01') }));
    await expect(startImpersonation({ userId: 'user-2' })).resolves.toBeUndefined();
  });

  it('returns NOT_FOUND for an unknown user', async () => {
    findById.mockResolvedValue(null);
    await expect(startImpersonation({ userId: 'ghost' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('stops at the rate limit', async () => {
    enforceRateLimit.mockRejectedValue(Object.assign(new Error('limit'), { code: 'RATE_LIMITED' }));
    await expect(startImpersonation({ userId: 'user-2' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(impersonateUserApi).not.toHaveBeenCalled();
  });
});

describe('stopImpersonation', () => {
  it('returns to the admin session and records the admin as the actor', async () => {
    requireUser.mockResolvedValue(
      sessionOf({ id: 'user-2', name: 'Борис', role: 'user' }, 'admin-1'),
    );
    await expect(stopImpersonation()).resolves.toEqual({ userId: 'user-2' });
    expect(stopImpersonatingApi).toHaveBeenCalled();
    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'admin.impersonation_stopped',
        actor: { actorId: 'admin-1' },
        targetUserId: 'user-2',
      }),
    );
  });

  it('rejects an ordinary session', async () => {
    requireUser.mockResolvedValue(sessionOf({ id: 'user-2', role: 'user' }));
    await expect(stopImpersonation()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(stopImpersonatingApi).not.toHaveBeenCalled();
  });
});

describe('getMyImpersonation', () => {
  it('is null without impersonation', async () => {
    getSession.mockResolvedValue(sessionOf({ id: 'user-2' }));
    await expect(getMyImpersonation()).resolves.toBeNull();
  });

  it('names the user and the admin', async () => {
    getSession.mockResolvedValue(sessionOf({ id: 'user-2', name: 'Борис' }, 'admin-1'));
    findById.mockResolvedValue(userRow({ id: 'admin-1', name: 'Админ' }));
    await expect(getMyImpersonation()).resolves.toEqual({
      userName: 'Борис',
      adminName: 'Админ',
      expiresAt: new Date('2030-01-01T10:00:00Z'),
    });
  });
});
