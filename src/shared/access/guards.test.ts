import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';

const getSession = vi.fn<() => Promise<AuthSession | null>>();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('@/shared/auth', () => ({ getSession: () => getSession() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: () => notFound(),
}));

const { requireAdmin, requireAdminOrNotFound, requireUser, requireUserOrRedirect } =
  await import('./guards');

function sessionOf(overrides: Partial<AuthSession['user']> = {}): AuthSession {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      image: null,
      role: 'user',
      banned: false,
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

  it('returns session for active user', async () => {
    const session = sessionOf();
    getSession.mockResolvedValue(session);
    await expect(requireUser()).resolves.toBe(session);
  });
});

describe('requireAdmin', () => {
  it('throws FORBIDDEN for regular user', async () => {
    getSession.mockResolvedValue(sessionOf());
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('passes for admin', async () => {
    getSession.mockResolvedValue(sessionOf({ role: 'admin' }));
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
  it('responds 404 for regular user', async () => {
    getSession.mockResolvedValue(sessionOf());
    await expect(requireAdminOrNotFound()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('passes for admin', async () => {
    getSession.mockResolvedValue(sessionOf({ role: 'admin' }));
    await expect(requireAdminOrNotFound()).resolves.toMatchObject({ user: { role: 'admin' } });
  });
});
