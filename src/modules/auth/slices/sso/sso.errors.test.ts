import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';

import { RateLimitError } from '@/shared/errors';

import { mapAuthError } from './sso.errors';

function apiError(code: string) {
  return new APIError('BAD_REQUEST', { code, message: `better-auth: ${code}` });
}

describe('mapAuthError', () => {
  it.each([
    ['BANNED_USER', 'FORBIDDEN'],
    ['SIGN_IN_PROVIDER_NOT_ALLOWED', 'FORBIDDEN'],
  ])('%s → %s', (betterAuthCode, expected) => {
    expect(mapAuthError(apiError(betterAuthCode))).toMatchObject({ code: expected });
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
