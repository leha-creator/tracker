import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError, RateLimitError } from '@/shared/errors';

const signInEmail = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const signUpEmail = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const enforceRateLimit = vi.fn<(...args: unknown[]) => Promise<void>>();

const findUserIdByEmail = vi.fn<(email: string) => Promise<string | null>>();
const recordAuditEvent = vi.fn<(input: Record<string, unknown>) => Promise<void>>();
vi.mock('@/shared/audit', () => ({
  recordAuditEvent: (input: Record<string, unknown>) => recordAuditEvent(input),
  auditActorFromSession: (session: { user: { id: string } }) => ({ actorId: session.user.id }),
  auditRequestContext: () => ({ ip: '203.0.113.5', userAgent: null }),
}));
vi.mock('./credentials.repository', () => ({
  credentialsRepository: { findUserIdByEmail: (email: string) => findUserIdByEmail(email) },
}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/auth', () => ({
  getAuth: () => ({ api: { signInEmail, signUpEmail } }),
  verifyEmailCallbackPath: (returnTo: string) => `/verify-email?returnTo=${returnTo}`,
}));
vi.mock('@/shared/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
  getClientIp: () => '203.0.113.5',
}));

const evaluateSignup =
  vi.fn<(input: { email: string; isAdminEmail: boolean }) => Promise<unknown>>();
vi.mock('@/shared/resource-settings', () => ({
  evaluateSignup: (input: { email: string; isAdminEmail: boolean }) => evaluateSignup(input),
  getSignupPolicy: () => Promise.resolve({ signupMode: 'open', allowedEmailDomains: [] }),
  SIGNUP_REJECTION_MESSAGES: { closed: 'Регистрация закрыта' },
}));
vi.mock('@/shared/env', () => ({
  getEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ADMIN_EMAILS: ['admin@example.com'] }),
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
  findUserIdByEmail.mockReset().mockResolvedValue(null);
  recordAuditEvent.mockReset().mockResolvedValue();
  evaluateSignup.mockReset().mockResolvedValue(null);
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

describe('signIn audit', () => {
  const invalid = () =>
    Object.assign(new Error('Invalid email or password'), {
      status: 'UNAUTHORIZED',
      body: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    });

  it('records a failed sign-in for an existing user', async () => {
    findUserIdByEmail.mockResolvedValueOnce('u1');
    signInEmail.mockRejectedValueOnce(invalid());
    await expect(signIn({ email: 'a@example.com', password: 'x' })).rejects.toBeDefined();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'auth.sign_in_failed',
        actor: null,
        targetUserId: 'u1',
        data: expect.objectContaining({ method: 'password' }) as unknown,
      }),
    );
  });

  it('does not record attempts for unknown emails', async () => {
    signInEmail.mockRejectedValueOnce(invalid());
    await expect(signIn({ email: 'nobody@example.com', password: 'x' })).rejects.toBeDefined();
    expect(findUserIdByEmail).toHaveBeenCalledWith('nobody@example.com');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('keeps the original error when the audit lookup fails', async () => {
    findUserIdByEmail.mockRejectedValueOnce(new Error('db down'));
    const error = invalid();
    signInEmail.mockRejectedValueOnce(error);
    await expect(signIn({ email: 'a@example.com', password: 'x' })).rejects.not.toThrow('db down');
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

  it('rejects by resource settings before Better Auth', async () => {
    evaluateSignup.mockResolvedValueOnce('closed');
    await expect(signUp(SIGN_UP)).rejects.toBeInstanceOf(ForbiddenError);
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(evaluateSignup).toHaveBeenCalledWith({ email: 'a@example.com', isAdminEmail: false });
  });
});
