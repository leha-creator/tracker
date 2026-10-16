import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';

import { mapAdminError } from './admin.errors';

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
