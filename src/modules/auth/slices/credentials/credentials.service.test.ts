import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitError } from '@/shared/errors';

const signInEmail = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const signUpEmail = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const enforceRateLimit = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/auth', () => ({
  getAuth: () => ({ api: { signInEmail, signUpEmail } }),
  verifyEmailCallbackPath: (returnTo: string) => `/verify-email?returnTo=${returnTo}`,
}));
vi.mock('@/shared/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
  getClientIp: () => '203.0.113.5',
}));

const { signIn, signUp } = await import('./credentials.service');

const SIGN_UP = {
  name: 'Анна',
  email: 'a@example.com',
  password: 'password123',
  confirmPassword: 'password123',
};

beforeEach(() => {
  signInEmail.mockReset();
  signUpEmail.mockReset();
  enforceRateLimit.mockReset().mockResolvedValue();
});

describe('signIn', () => {
  it('checks the rate limit by ip and email before Better Auth', async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(60));

    await expect(signIn({ email: 'a@example.com', password: 'x' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(enforceRateLimit).toHaveBeenCalledWith('sign-in', {
      ip: '203.0.113.5',
      email: 'a@example.com',
    });
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('returns two-factor when the plugin asks for a second step', async () => {
    signInEmail.mockResolvedValueOnce({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
    await expect(signIn({ email: 'a@example.com', password: 'x' })).resolves.toEqual({
      kind: 'two-factor',
    });
  });

  it('returns the signed-in user', async () => {
    signInEmail.mockResolvedValueOnce({ redirect: false, token: 't', user: { id: 'u1' } });
    await expect(
      signIn({ email: 'a@example.com', password: 'x', returnTo: '/w/a' }),
    ).resolves.toEqual({ kind: 'signed-in', userId: 'u1' });
    expect(signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ callbackURL: '/verify-email?returnTo=/w/a' }) as unknown,
      }),
    );
  });
});

describe('signUp', () => {
  it('reports a sent verification email when no session is created', async () => {
    signUpEmail.mockResolvedValueOnce({ token: null, user: { id: 'u1' } });
    await expect(signUp(SIGN_UP)).resolves.toEqual({ kind: 'verification-sent' });
    expect(enforceRateLimit).toHaveBeenCalledWith('sign-up', { ip: '203.0.113.5' });
  });

  it('signs in when verification is not required', async () => {
    signUpEmail.mockResolvedValueOnce({ token: 'session', user: { id: 'u1' } });
    await expect(signUp(SIGN_UP)).resolves.toEqual({ kind: 'signed-in', userId: 'u1' });
  });
});
