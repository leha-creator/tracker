import { describe, expect, it } from 'vitest';

import {
  buildOidcProviderConfig,
  idpAccountUrl,
  OIDC_PROVIDER_ID,
  oidcSettingsFromEnv,
} from './oidc-config';

const SETTINGS = {
  issuer: 'https://auth.plwedding.ru',
  clientId: 'tasker',
  clientSecret: 'x'.repeat(32),
};

describe('oidcSettingsFromEnv', () => {
  it('collects issuer, client id and secret', () => {
    expect(
      oidcSettingsFromEnv({
        OIDC_ISSUER: SETTINGS.issuer,
        OIDC_CLIENT_ID: 'tasker',
        OIDC_CLIENT_SECRET: SETTINGS.clientSecret,
      }),
    ).toEqual(SETTINGS);
  });
});

describe('buildOidcProviderConfig', () => {
  it('follows the IdP client contract', () => {
    const config = buildOidcProviderConfig(SETTINGS);
    expect(config).toMatchObject({
      providerId: OIDC_PROVIDER_ID,
      discoveryUrl: 'https://auth.plwedding.ru/.well-known/openid-configuration',
      clientId: 'tasker',
      authentication: 'basic',
      scopes: ['openid', 'email', 'profile'],
      pkce: true,
      requireIdTokenVerification: true,
      requireEmailVerification: true,
      overrideUserInfo: true,
      postLogoutRedirectURI: '/login',
    });
    expect(config.clientSecret).toBe(SETTINGS.clientSecret);
  });

  it('maps profile with the configured issuer', async () => {
    const config = buildOidcProviderConfig(SETTINGS);
    const mapped = await config.mapProfileToUser?.({
      emailVerified: true,
      sub: 'u1',
      email: 'a@b.ru',
      email_verified: true,
      name: 'A',
      picture: 'https://auth.plwedding.ru/api/users/u1/avatar?v=1',
    });
    expect(mapped).toMatchObject({ name: 'A', image: '/api/idp-avatar/u1?v=1' });
  });
});

describe('idpAccountUrl', () => {
  it('points to the IdP account page', () => {
    expect(idpAccountUrl(SETTINGS.issuer)).toBe('https://auth.plwedding.ru/account');
  });
});
