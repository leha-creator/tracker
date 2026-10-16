import { APIError } from 'better-auth/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitError } from '@/shared/errors';

const sendVerificationEmail = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const enforceRateLimit = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.5' })),
}));
vi.mock('@/shared/auth', () => ({
  getAuth: () => ({ api: { sendVerificationEmail } }),
  verifyEmailCallbackPath: (returnTo: string) => `/verify-email?returnTo=${returnTo}`,
}));
vi.mock('@/shared/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
  getClientIp: () => '203.0.113.5',
}));

const { resendVerificationEmail } = await import('./verification.service');

beforeEach(() => {
  sendVerificationEmail.mockReset().mockResolvedValue({ status: true });
  enforceRateLimit.mockReset().mockResolvedValue();
});

describe('resendVerificationEmail', () => {
  it('checks the rate limit before Better Auth', async () => {
    await resendVerificationEmail({ email: 'a@example.com', returnTo: '/invite/1' });

    expect(enforceRateLimit).toHaveBeenCalledWith('verification-resend', {
      ip: '203.0.113.5',
      email: 'a@example.com',
    });
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: 'a@example.com', callbackURL: '/verify-email?returnTo=/invite/1' },
      }),
    );
  });

  it('answers the same for unknown or verified accounts', async () => {
    sendVerificationEmail.mockRejectedValueOnce(
      new APIError('BAD_REQUEST', { code: 'EMAIL_ALREADY_VERIFIED', message: 'verified' }),
    );
    await expect(resendVerificationEmail({ email: 'a@example.com' })).resolves.toBeUndefined();
  });

  it('reports the rate limit', async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(60));
    await expect(resendVerificationEmail({ email: 'a@example.com' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
