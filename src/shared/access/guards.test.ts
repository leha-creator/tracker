import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';

const getSession = vi.fn<() => Promise<AuthSession | null>>();
const getFreshSession = vi.fn<() => Promise<AuthSession | null>>();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('@/shared/auth', () => ({
  getSession: () => getSession(),
  getFreshSession: () => getFreshSession(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: () => notFound(),
}));

const {
  requireAdmin,
  requireAdminOrNotFound,
  requireNotImpersonating,
  requireUser,
  requireUserOrRedirect,
} = await import('./guards');

function sessionOf(overrides: Partial<AuthSession['user']> = {}): AuthSession {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      image: null,
      role: 'user',
      banned: false,
      isAgent: false,
      ...overrides,
    },
    session: { id: 'session-1', expiresAt: new Date('2030-01-01') },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireUser', () => {
  it('throws UNAUTHORIZED without session', async () => {
    getSession.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws FORBIDDEN for banned user', async () => {
    getSession.mockResolvedValue(sessionOf({ banned: true }));
    await expect(requireUser()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws FORBIDDEN for an agent', async () => {
    getSession.mockResolvedValue(sessionOf({ isAgent: true }));
    await expect(requireUser()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns session for active user', async () => {
    const session = sessionOf();
    getSession.mockResolvedValue(session);
    await expect(requireUser()).resolves.toBe(session);
  });
});

describe('requireAdmin', () => {
  it('reads fresh session, not the cookie-cached one', async () => {
    getSession.mockResolvedValue(sessionOf({ role: 'admin' }));
    getFreshSession.mockResolvedValue(sessionOf());
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(getSession).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED without session', async () => {
    getFreshSession.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws FORBIDDEN for banned admin', async () => {
    getFreshSession.mockResolvedValue(sessionOf({ role: 'admin', banned: true }));
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws FORBIDDEN for regular user', async () => {
    getFreshSession.mockResolvedValue(sessionOf());
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('passes for admin', async () => {
    getFreshSession.mockResolvedValue(sessionOf({ role: 'admin' }));
    await expect(requireAdmin()).resolves.toMatchObject({ user: { role: 'admin' } });
  });
});

describe('requireUserOrRedirect', () => {
  it('redirects to login with safe returnTo', async () => {
    getSession.mockResolvedValue(null);
    await expect(requireUserOrRedirect('/admin?tab=users')).rejects.toThrow(
      'NEXT_REDIRECT:/login?returnTo=%2Fadmin%3Ftab%3Dusers',
    );
  });

  it('drops absolute returnTo', async () => {
    getSession.mockResolvedValue(null);
    await expect(requireUserOrRedirect('https://evil.com')).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe('requireAdminOrNotFound', () => {
  it('redirects to login without fresh session', async () => {
    getFreshSession.mockResolvedValue(null);
    await expect(requireAdminOrNotFound('/admin/users')).rejects.toThrow(
      'NEXT_REDIRECT:/login?returnTo=%2Fadmin%2Fusers',
    );
  });

  it('responds 404 for regular user', async () => {
    getFreshSession.mockResolvedValue(sessionOf());
    await expect(requireAdminOrNotFound()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('passes for admin', async () => {
    getFreshSession.mockResolvedValue(sessionOf({ role: 'admin' }));
    await expect(requireAdminOrNotFound()).resolves.toMatchObject({ user: { role: 'admin' } });
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe('requireNotImpersonating', () => {
  it('passes an ordinary session', () => {
    expect(() => requireNotImpersonating(sessionOf())).not.toThrow();
  });

  it('forbids actions under impersonation', () => {
    const session = sessionOf();
    session.session.impersonatedBy = 'admin-1';
    expect(() => requireNotImpersonating(session)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});
