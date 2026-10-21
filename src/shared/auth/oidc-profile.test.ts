import { describe, expect, it } from 'vitest';

import {
  idpAvatarPath,
  idpAvatarSourceUrl,
  isIdpAvatarPath,
  isValidIdpAvatarRef,
  mapIdpPicture,
  mapIdpProfile,
} from './oidc-profile';

const ISSUER = 'https://auth.plwedding.ru';

describe('mapIdpPicture', () => {
  it('maps IdP avatar of the same user to the app path', () => {
    expect(mapIdpPicture(`${ISSUER}/api/users/u_1/avatar?v=abc-2`, 'u_1', ISSUER)).toBe(
      '/api/idp-avatar/u_1?v=abc-2',
    );
  });

  it('drops foreign hosts, other users and unversioned urls', () => {
    expect(mapIdpPicture('https://avatars.githubusercontent.com/u/1?v=4', 'u1', ISSUER)).toBe(
      undefined,
    );
    expect(mapIdpPicture(`${ISSUER}/api/users/other/avatar?v=1`, 'u1', ISSUER)).toBeUndefined();
    expect(mapIdpPicture(`${ISSUER}/api/users/u1/avatar`, 'u1', ISSUER)).toBeUndefined();
    expect(mapIdpPicture(`${ISSUER}/api/users/u1/avatar?v=a/b`, 'u1', ISSUER)).toBeUndefined();
    expect(mapIdpPicture('not a url', 'u1', ISSUER)).toBeUndefined();
    expect(mapIdpPicture(undefined, 'u1', ISSUER)).toBeUndefined();
  });
});

describe('mapIdpProfile', () => {
  it('maps claims to user fields', () => {
    expect(
      mapIdpProfile(
        {
          sub: 'u1',
          email: 'Anna@Example.com',
          email_verified: true,
          name: ' Анна ',
          picture: `${ISSUER}/api/users/u1/avatar?v=7`,
          groups: ['admin'],
        },
        ISSUER,
      ),
    ).toEqual({
      name: 'Анна',
      email: 'anna@example.com',
      emailVerified: true,
      image: '/api/idp-avatar/u1?v=7',
    });
  });

  it('falls back to email local part and unverified email', () => {
    expect(mapIdpProfile({ sub: 'u1', email: 'bob@example.com' }, ISSUER)).toEqual({
      name: 'bob',
      email: 'bob@example.com',
      emailVerified: false,
      image: undefined,
    });
  });
});

describe('idp avatar path', () => {
  it('builds and recognizes the app path', () => {
    const path = idpAvatarPath('u1', 'v1');
    expect(path).toBe('/api/idp-avatar/u1?v=v1');
    expect(isIdpAvatarPath(path)).toBe(true);
    expect(isIdpAvatarPath('/api/idp-avatar/u1')).toBe(false);
    expect(isIdpAvatarPath('https://evil.example/api/idp-avatar/u1?v=1')).toBe(false);
  });

  it('validates refs and builds the IdP url', () => {
    expect(isValidIdpAvatarRef('u1', 'v1')).toBe(true);
    expect(isValidIdpAvatarRef('../x', 'v1')).toBe(false);
    expect(isValidIdpAvatarRef('u1', 'a&b')).toBe(false);
    expect(idpAvatarSourceUrl(ISSUER, 'u1', 'v1')).toBe(`${ISSUER}/api/users/u1/avatar?v=v1`);
  });
});
