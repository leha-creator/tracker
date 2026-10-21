import { describe, expect, it } from 'vitest';

import {
  isOidcCallback,
  oauthCallbackProvider,
  signInMethodFromRequest,
  signUpMethodFromRequest,
} from './auth-audit';

const callback = (id: string) => ({ path: '/callback/:id', params: { id } });

describe('oauthCallbackProvider', () => {
  it('reads the provider from route params of the callback template', () => {
    expect(oauthCallbackProvider(callback('plwedding'))).toBe('plwedding');
    expect(oauthCallbackProvider(callback('github'))).toBe('github');
    expect(oauthCallbackProvider({ path: '/callback/:id' })).toBeNull();
  });

  it('accepts a resolved callback path and ignores other endpoints', () => {
    expect(oauthCallbackProvider({ path: '/callback/github' })).toBe('github');
    expect(oauthCallbackProvider({ path: '/sign-in/email' })).toBeNull();
    expect(oauthCallbackProvider(null)).toBeNull();
  });

  it('detects the IdP callback', () => {
    expect(isOidcCallback(callback('plwedding'))).toBe(true);
    expect(isOidcCallback(callback('github'))).toBe(false);
  });
});

describe('signInMethodFromRequest', () => {
  it.each([
    [{ path: '/sign-in/email' }, 'password'],
    [{ path: '/sign-up/email' }, 'password'],
    [callback('github'), 'github'],
    [callback('plwedding'), 'oidc'],
    [{ path: '/two-factor/verify-totp' }, 'two_factor'],
    [{ path: '/two-factor/verify-backup-code' }, 'two_factor'],
    [callback('unknown'), 'other'],
    [{ path: '/verify-email' }, 'other'],
    [undefined, 'other'],
  ])('%o → %s', (request, method) => {
    expect(signInMethodFromRequest(request)).toBe(method);
  });
});

describe('signUpMethodFromRequest', () => {
  it('detects the provider by the OAuth callback', () => {
    expect(signUpMethodFromRequest(callback('github'))).toBe('github');
    expect(signUpMethodFromRequest(callback('plwedding'))).toBe('oidc');
    expect(signUpMethodFromRequest({ path: '/sign-up/email' })).toBe('email');
    expect(signUpMethodFromRequest(null)).toBe('email');
  });
});
