import { describe, expect, it } from 'vitest';

import { resolveSignOutRedirect } from './sign-out';

const ISSUER = 'https://auth.plwedding.ru';
const LOGOUT = `${ISSUER}/api/auth/oauth2/end-session?id_token_hint=t&post_logout_redirect_uri=x`;

describe('resolveSignOutRedirect', () => {
  it('goes to the IdP end-session endpoint', () => {
    expect(
      resolveSignOutRedirect({ providerLogoutUrl: LOGOUT, impersonating: false, issuer: ISSUER }),
    ).toBe(LOGOUT);
  });

  it('stays local without IdP logout url or OIDC', () => {
    expect(
      resolveSignOutRedirect({ providerLogoutUrl: null, impersonating: false, issuer: ISSUER }),
    ).toBe('/login');
    expect(
      resolveSignOutRedirect({
        providerLogoutUrl: LOGOUT,
        impersonating: false,
        issuer: undefined,
      }),
    ).toBe('/login');
  });

  it('stays local under impersonation', () => {
    expect(
      resolveSignOutRedirect({ providerLogoutUrl: LOGOUT, impersonating: true, issuer: ISSUER }),
    ).toBe('/login');
  });

  it('rejects foreign origins', () => {
    expect(
      resolveSignOutRedirect({
        providerLogoutUrl: 'https://evil.example/logout',
        impersonating: false,
        issuer: ISSUER,
      }),
    ).toBe('/login');
    expect(
      resolveSignOutRedirect({ providerLogoutUrl: 'nope', impersonating: false, issuer: ISSUER }),
    ).toBe('/login');
  });
});
