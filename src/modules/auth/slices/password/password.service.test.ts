import { APIError } from 'better-auth/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { RateLimitError } from '@/shared/errors';

const requestPasswordResetApi = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const resetPasswordApi = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const changePasswordApi = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const sendPasswordChangedMail = vi.fn<(...args: unknown[]) => void>();
const enforceRateLimit = vi.fn<(...args: unknown[]) => Promise<void>>();

const SESSION = {
  user: { id: 'u1', email: 'a@example.com', name: 'Анна' },
  session: { id: 's1', expiresAt: new Date() },
} as AuthSession;

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/access', () => ({ requireUser: () => Promise.resolve(SESSION) }));
vi.mock('@/shared/auth', () => ({
  getAuth: () => ({
    api: {
      requestPasswordReset: requestPasswordResetApi,
      resetPassword: resetPasswordApi,
      changePassword: changePasswordApi,
    },
  }),
  sendPasswordChangedMail: (...args: unknown[]) => {
    sendPasswordChangedMail(...args);
  },
}));
vi.mock('@/shared/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
  getClientIp: () => '203.0.113.5',
}));

const { changePassword, requestPasswordReset, resetPassword } = await import('./password.service');

function apiError(code: string) {
  return new APIError('BAD_REQUEST', { code, message: code });
}

beforeEach(() => {
  requestPasswordResetApi.mockReset().mockResolvedValue({ status: true });
  resetPasswordApi.mockReset().mockResolvedValue({ status: true });
  changePasswordApi.mockReset().mockResolvedValue({ token: null });
  sendPasswordChangedMail.mockReset();
  enforceRateLimit.mockReset().mockResolvedValue();
});

describe('requestPasswordReset', () => {
  it('limits by ip and email and redirects to the reset page', async () => {
    await requestPasswordReset({ email: 'a@example.com' });

    expect(enforceRateLimit).toHaveBeenCalledWith('password-reset-request', {
      ip: '203.0.113.5',
      email: 'a@example.com',
    });
    expect(requestPasswordResetApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: 'a@example.com', redirectTo: '/reset-password' } }),
    );
  });

  it('answers the same when Better Auth rejects the email', async () => {
    requestPasswordResetApi.mockRejectedValueOnce(apiError('USER_NOT_FOUND'));
    await expect(requestPasswordReset({ email: 'x@example.com' })).resolves.toBeUndefined();
  });

  it('reports the rate limit', async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(600));
    await expect(requestPasswordReset({ email: 'a@example.com' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});

describe('resetPassword', () => {
  it('maps an invalid token', async () => {
    resetPasswordApi.mockRejectedValueOnce(apiError('INVALID_TOKEN'));
    await expect(
      resetPassword({ token: 't', password: 'password-1', confirmPassword: 'password-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('changePassword', () => {
  const input = {
    currentPassword: 'old-password',
    newPassword: 'new-password',
    confirmPassword: 'new-password',
  };

  it('revokes other sessions and sends a notification', async () => {
    await changePassword(input);

    expect(enforceRateLimit).toHaveBeenCalledWith('change-password', {
      ip: '203.0.113.5',
      userId: 'u1',
    });
    expect(changePasswordApi).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          currentPassword: 'old-password',
          newPassword: 'new-password',
          revokeOtherSessions: true,
        },
      }),
    );
    expect(sendPasswordChangedMail).toHaveBeenCalledWith({ email: 'a@example.com', name: 'Анна' });
  });

  it('attaches a wrong current password to its field', async () => {
    changePasswordApi.mockRejectedValueOnce(apiError('INVALID_PASSWORD'));
    await expect(changePassword(input)).rejects.toMatchObject({
      fieldErrors: { currentPassword: ['Неверный пароль'] },
    });
    expect(sendPasswordChangedMail).not.toHaveBeenCalled();
  });
});
