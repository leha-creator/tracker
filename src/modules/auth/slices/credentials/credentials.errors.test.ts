import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';

import { RateLimitError } from '@/shared/errors';

import { EMAIL_NOT_VERIFIED_REASON, mapAuthError } from './credentials.errors';

function apiError(code: string) {
  return new APIError('BAD_REQUEST', { code, message: `better-auth: ${code}` });
}

describe('mapAuthError', () => {
  it.each([
    ['USER_ALREADY_EXISTS', 'CONFLICT'],
    ['USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', 'CONFLICT'],
    ['INVALID_EMAIL_OR_PASSWORD', 'UNAUTHORIZED'],
    ['BANNED_USER', 'FORBIDDEN'],
    ['PASSWORD_TOO_SHORT', 'VALIDATION_ERROR'],
    ['PASSWORD_TOO_LONG', 'VALIDATION_ERROR'],
    ['INVALID_EMAIL', 'VALIDATION_ERROR'],
    ['EMAIL_NOT_VERIFIED', 'FORBIDDEN'],
    ['INVALID_TOKEN', 'VALIDATION_ERROR'],
    ['TOKEN_EXPIRED', 'VALIDATION_ERROR'],
    ['INVALID_PASSWORD', 'VALIDATION_ERROR'],
    ['INVALID_CODE', 'VALIDATION_ERROR'],
    ['INVALID_BACKUP_CODE', 'VALIDATION_ERROR'],
    ['INVALID_TWO_FACTOR_COOKIE', 'UNAUTHORIZED'],
    ['ACCOUNT_TEMPORARILY_LOCKED', 'FORBIDDEN'],
    ['SESSION_NOT_FRESH', 'UNAUTHORIZED'],
  ])('%s → %s', (betterAuthCode, expected) => {
    expect(mapAuthError(apiError(betterAuthCode))).toMatchObject({ code: expected });
  });

  it('uses one message for wrong email and wrong password', () => {
    expect(mapAuthError(apiError('INVALID_EMAIL_OR_PASSWORD'))).toMatchObject({
      message: 'Неверный email или пароль',
    });
  });

  it('attaches password field errors', () => {
    expect(mapAuthError(apiError('PASSWORD_TOO_SHORT'))).toMatchObject({
      fieldErrors: { password: [expect.any(String)] },
    });
  });

  it('marks unverified email for the sign-in form', () => {
    expect(mapAuthError(apiError('EMAIL_NOT_VERIFIED'))).toMatchObject({
      details: { reason: EMAIL_NOT_VERIFIED_REASON },
    });
  });

  it('attaches INVALID_PASSWORD to the requested field', () => {
    expect(
      mapAuthError(apiError('INVALID_PASSWORD'), { passwordField: 'currentPassword' }),
    ).toMatchObject({ fieldErrors: { currentPassword: ['Неверный пароль'] } });
  });

  it('maps HTTP 429 to RateLimitError with X-Retry-After', () => {
    const error = mapAuthError(
      new APIError('TOO_MANY_REQUESTS', { message: 'Too many' }, { 'X-Retry-After': '42' }),
    );
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(42);
  });

  it('returns unknown errors unchanged', () => {
    const unknownApiError = apiError('SOMETHING_ELSE');
    const plain = new Error('boom');
    expect(mapAuthError(unknownApiError)).toBe(unknownApiError);
    expect(mapAuthError(plain)).toBe(plain);
  });
});
