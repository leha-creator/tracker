import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';

import { mapAuthError } from './credentials.errors';

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

  it('returns unknown errors unchanged', () => {
    const unknownApiError = apiError('SOMETHING_ELSE');
    const plain = new Error('boom');
    expect(mapAuthError(unknownApiError)).toBe(unknownApiError);
    expect(mapAuthError(plain)).toBe(plain);
  });
});
