import { describe, expect, it } from 'vitest';

import { signInMethodFromPath, signUpMethodFromPath } from './auth-audit';

describe('signInMethodFromPath', () => {
  it.each([
    ['/sign-in/email', 'password'],
    ['/sign-up/email', 'password'],
    ['/callback/github', 'github'],
    ['/two-factor/verify-totp', 'two_factor'],
    ['/two-factor/verify-backup-code', 'two_factor'],
    ['/verify-email', 'other'],
    [undefined, 'other'],
  ])('%s → %s', (path, method) => {
    expect(signInMethodFromPath(path)).toBe(method);
  });
});

describe('signUpMethodFromPath', () => {
  it('detects GitHub sign-up by the OAuth callback', () => {
    expect(signUpMethodFromPath('/callback/github')).toBe('github');
    expect(signUpMethodFromPath('/sign-up/email')).toBe('email');
    expect(signUpMethodFromPath(null)).toBe('email');
  });
});
