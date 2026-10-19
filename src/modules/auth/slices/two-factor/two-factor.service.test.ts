import { APIError } from 'better-auth/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { RateLimitError, ValidationError } from '@/shared/errors';

const api = {
  verifyTOTP: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  verifyBackupCode: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  enableTwoFactor: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  disableTwoFactor: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  generateBackupCodes: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
};
const enforceRateLimit = vi.fn<(...args: unknown[]) => Promise<void>>();
const findState = vi.fn<(userId: string) => Promise<unknown>>();
const cookieList = vi.fn<() => { name: string }[]>();

const recordAuditEvent = vi.fn<(input: Record<string, unknown>) => Promise<void>>();
vi.mock('@/shared/audit', () => ({
  recordAuditEvent: (input: Record<string, unknown>) => recordAuditEvent(input),
  auditActorFromSession: (session: { user: { id: string } }) => ({ actorId: session.user.id }),
  auditRequestContext: () => ({ ip: '203.0.113.5', userAgent: null }),
}));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ getAll: () => cookieList() }),
}));
vi.mock('@/shared/access', () => ({
  requireNotImpersonating: () => undefined,
  requireUser: () => Promise.resolve({ user: { id: 'u1' }, session: { id: 's1' } } as AuthSession),
}));
vi.mock('@/shared/auth', () => ({ getAuth: () => ({ api }) }));
vi.mock('@/shared/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
  getClientIp: () => '203.0.113.5',
}));
vi.mock('./two-factor.repository', () => ({
  twoFactorRepository: { findState: (userId: string) => findState(userId) },
}));

const service = await import('./two-factor.service');

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  enforceRateLimit.mockReset().mockResolvedValue();
  findState.mockReset().mockResolvedValue({ twoFactorEnabled: false, hasPassword: true });
  cookieList.mockReset().mockReturnValue([]);
  recordAuditEvent.mockReset().mockResolvedValue();
});

describe('sign-in step', () => {
  it('limits attempts before Better Auth', async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(60));
    await expect(
      service.verifySignInTotp({ code: '123456', trustDevice: false }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(api.verifyTOTP).not.toHaveBeenCalled();
  });

  it('passes trustDevice to Better Auth', async () => {
    api.verifyBackupCode.mockResolvedValueOnce({ token: 't' });
    await service.verifySignInBackupCode({ code: 'abcde-12345', trustDevice: true });
    expect(api.verifyBackupCode).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: 'abcde-12345', trustDevice: true } }),
    );
  });

  it('maps a wrong code', async () => {
    api.verifyTOTP.mockRejectedValueOnce(
      new APIError('UNAUTHORIZED', { code: 'INVALID_CODE', message: 'Invalid code' }),
    );
    await expect(
      service.verifySignInTotp({ code: '000000', trustDevice: false }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { code: ['Неверный код'] } });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'auth.sign_in_failed',
        actor: null,
        data: { method: 'two_factor', reason: 'INVALID_CODE' },
      }),
    );
  });

  it('detects a pending two-factor sign-in by cookie name', async () => {
    cookieList.mockReturnValueOnce([{ name: '__Secure-better-auth.two_factor' }]);
    await expect(service.hasPendingTwoFactorSignIn()).resolves.toBe(true);
    await expect(service.hasPendingTwoFactorSignIn()).resolves.toBe(false);
  });
});

describe('management', () => {
  it('returns the setup on enable', async () => {
    api.enableTwoFactor.mockResolvedValueOnce({
      method: 'totp',
      totpURI: 'otpauth://totp/x?secret=A',
      backupCodes: ['a'],
    });
    await expect(service.startEnableTwoFactor({ password: 'pw' })).resolves.toEqual({
      totpURI: 'otpauth://totp/x?secret=A',
      backupCodes: ['a'],
    });
  });

  it('refuses users without a password', async () => {
    findState.mockResolvedValueOnce({ twoFactorEnabled: false, hasPassword: false });
    await expect(service.startEnableTwoFactor({ password: 'pw' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(api.enableTwoFactor).not.toHaveBeenCalled();
  });

  it('refuses to enable twice', async () => {
    findState.mockResolvedValueOnce({ twoFactorEnabled: true, hasPassword: true });
    await expect(service.startEnableTwoFactor({ password: 'pw' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses to regenerate backup codes when 2FA is off', async () => {
    await expect(service.regenerateBackupCodes({ password: 'pw' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
