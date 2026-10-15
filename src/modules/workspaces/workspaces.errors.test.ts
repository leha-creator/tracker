import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';

import { mapOrganizationError } from './workspaces.errors';

function apiError(code: string) {
  return new APIError('BAD_REQUEST', { code, message: `better-auth: ${code}` });
}

describe('mapOrganizationError', () => {
  it.each([
    ['ORGANIZATION_SLUG_ALREADY_TAKEN', 'CONFLICT'],
    ['ORGANIZATION_ALREADY_EXISTS', 'CONFLICT'],
    ['USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION', 'CONFLICT'],
    ['USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION', 'CONFLICT'],
    ['ORGANIZATION_NOT_FOUND', 'NOT_FOUND'],
    ['MEMBER_NOT_FOUND', 'NOT_FOUND'],
    ['INVITATION_NOT_FOUND', 'NOT_FOUND'],
    ['YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION', 'FORBIDDEN'],
    ['YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION', 'FORBIDDEN'],
    ['YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION', 'FORBIDDEN'],
    ['YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION', 'FORBIDDEN'],
    ['YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER', 'VALIDATION_ERROR'],
    ['YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER', 'VALIDATION_ERROR'],
    ['INVITATION_LIMIT_REACHED', 'VALIDATION_ERROR'],
    ['ORGANIZATION_MEMBERSHIP_LIMIT_REACHED', 'VALIDATION_ERROR'],
    ['YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS', 'VALIDATION_ERROR'],
  ])('%s → %s', (pluginCode, expected) => {
    expect(mapOrganizationError(apiError(pluginCode))).toMatchObject({ code: expected });
  });

  it('attaches field errors for slug and email conflicts', () => {
    expect(mapOrganizationError(apiError('ORGANIZATION_SLUG_ALREADY_TAKEN'))).toMatchObject({
      fieldErrors: { slug: [expect.any(String)] },
    });
    expect(
      mapOrganizationError(apiError('USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION')),
    ).toMatchObject({ fieldErrors: { email: [expect.any(String)] } });
  });

  it('returns unknown errors unchanged', () => {
    const unknownApiError = apiError('SOMETHING_NEW');
    const plain = new Error('boom');
    expect(mapOrganizationError(unknownApiError)).toBe(unknownApiError);
    expect(mapOrganizationError(plain)).toBe(plain);
  });
});
