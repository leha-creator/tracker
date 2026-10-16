import { describe, expect, it } from 'vitest';

import {
  buildAuthRateLimitRules,
  buildSyntheticUser,
  verifyEmailCallbackPath,
} from './auth-options';

describe('buildAuthRateLimitRules', () => {
  it('covers sign-in, password reset, verification and two-factor endpoints', () => {
    const rules = buildAuthRateLimitRules();

    expect(Object.keys(rules)).toEqual(
      expect.arrayContaining([
        '/sign-in/email',
        '/sign-up/email',
        '/request-password-reset',
        '/send-verification-email',
        '/two-factor/*',
      ]),
    );
    for (const rule of Object.values(rules)) {
      expect(rule.max).toBeGreaterThan(0);
      expect(rule.window).toBeGreaterThan(0);
    }
  });
});

describe('buildSyntheticUser', () => {
  it('adds plugin fields with the defaults of a new user', () => {
    const user = buildSyntheticUser({
      coreFields: { name: 'Анна', email: 'a@example.com', emailVerified: false },
      additionalFields: {},
      id: 'synthetic-id',
    });

    expect(user).toEqual({
      name: 'Анна',
      email: 'a@example.com',
      emailVerified: false,
      role: 'user',
      banned: false,
      banReason: null,
      banExpires: null,
      isAgent: false,
      twoFactorEnabled: false,
      id: 'synthetic-id',
    });
  });
});

describe('verifyEmailCallbackPath', () => {
  it('keeps returnTo for the verification page', () => {
    expect(verifyEmailCallbackPath('/')).toBe('/verify-email');
    expect(verifyEmailCallbackPath('/invite/abc?x=1')).toBe(
      '/verify-email?returnTo=%2Finvite%2Fabc%3Fx%3D1',
    );
  });
});
