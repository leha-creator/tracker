import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';

import { IdpApiError, type IdpErrorCode } from '@/shared/idp';

import { IDP_ADMIN_UNAVAILABLE_MESSAGE, mapAdminError, mapIdpAdminError } from './admin.errors';

function apiError(code: string) {
  return new APIError('BAD_REQUEST', { code, message: `better-auth: ${code}` });
}

describe('mapAdminError', () => {
  it.each([
    ['YOU_CANNOT_BAN_YOURSELF', 'VALIDATION_ERROR'],
    ['YOU_CANNOT_REMOVE_YOURSELF', 'VALIDATION_ERROR'],
    ['USER_NOT_FOUND', 'NOT_FOUND'],
    ['YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE', 'VALIDATION_ERROR'],
    ['YOU_ARE_NOT_ALLOWED_TO_BAN_USERS', 'FORBIDDEN'],
    ['YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS', 'FORBIDDEN'],
  ])('%s → %s', (pluginCode, expected) => {
    expect(mapAdminError(apiError(pluginCode))).toMatchObject({ code: expected });
  });

  it('keeps unknown plugin errors and non-plugin errors as is', () => {
    const unknown = apiError('SOMETHING_ELSE');
    expect(mapAdminError(unknown)).toBe(unknown);
    const plain = new Error('boom');
    expect(mapAdminError(plain)).toBe(plain);
  });
});

describe('mapIdpAdminError', () => {
  function idpError(code: IdpErrorCode, status: number, retryAfterSeconds: number | null = null) {
    return new IdpApiError({ status, code, message: `IdP: ${code}`, retryAfterSeconds });
  }

  it.each([
    ['VALIDATION_ERROR', 400, 'VALIDATION_ERROR'],
    ['FORBIDDEN', 403, 'FORBIDDEN'],
    ['NOT_FOUND', 404, 'NOT_FOUND'],
  ] as const)('%s → %s with the IdP message', (code, status, expected) => {
    expect(mapIdpAdminError(idpError(code, status))).toMatchObject({
      code: expected,
      message: `IdP: ${code}`,
    });
  });

  it('keeps Retry-After of the IdP limit', () => {
    expect(mapIdpAdminError(idpError('RATE_LIMITED', 429, 120))).toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 120,
    });
  });

  it.each([
    ['UNAVAILABLE', 0],
    ['INTERNAL_ERROR', 502],
    ['UNAUTHORIZED', 401],
  ] as const)('%s → 503 with a retry hint', (code, status) => {
    expect(mapIdpAdminError(idpError(code, status))).toMatchObject({
      httpStatus: 503,
      message: IDP_ADMIN_UNAVAILABLE_MESSAGE,
    });
  });

  it('passes other errors through', () => {
    const error = new Error('x');
    expect(mapIdpAdminError(error)).toBe(error);
  });
});
