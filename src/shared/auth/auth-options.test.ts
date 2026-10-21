import { describe, expect, it } from 'vitest';

import { buildAuthRateLimitRules, isSignInProviderAllowed } from './auth-options';

describe('buildAuthRateLimitRules', () => {
  it('limits sign-in start, account linking and the OAuth callback', () => {
    const rules = buildAuthRateLimitRules();

    expect(Object.keys(rules)).toEqual(['/sign-in/social', '/link-social', '/callback/*']);
    for (const rule of Object.values(rules)) {
      expect(rule.max).toBeGreaterThan(0);
      expect(rule.window).toBeGreaterThan(0);
    }
  });
});

describe('isSignInProviderAllowed', () => {
  it('allows only the IdP', () => {
    expect(isSignInProviderAllowed('plwedding', 'plwedding')).toBe(true);
    expect(isSignInProviderAllowed('github', 'plwedding')).toBe(false);
    expect(isSignInProviderAllowed(undefined, 'plwedding')).toBe(false);
  });
});
