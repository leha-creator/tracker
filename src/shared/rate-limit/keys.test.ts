import { describe, expect, it } from 'vitest';

import { buildRateLimitChecks, hashIdentifier, rateLimitKey, UNKNOWN_IP } from './keys';
import { RATE_LIMITS } from './rules';

describe('hashIdentifier', () => {
  it('is stable and ignores case and surrounding spaces', () => {
    expect(hashIdentifier(' User@Example.com ')).toBe(hashIdentifier('user@example.com'));
    expect(hashIdentifier('user@example.com')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for different emails', () => {
    expect(hashIdentifier('a@example.com')).not.toBe(hashIdentifier('b@example.com'));
  });
});

describe('rateLimitKey', () => {
  it('joins parts with colons', () => {
    expect(rateLimitKey('sign-in', 'ip', '10.0.0.1')).toBe('sign-in:ip:10.0.0.1');
  });
});

describe('buildRateLimitChecks', () => {
  it('builds ip and ip+email checks without the raw email', () => {
    const checks = buildRateLimitChecks('sign-in', { ip: '10.0.0.1', email: 'user@example.com' });

    expect(checks.map((check) => check.scope)).toEqual(['ip', 'ipEmail']);
    expect(checks[0]?.rule).toBe(RATE_LIMITS['sign-in'].ip);
    expect(checks[1]?.key).toBe(`sign-in:ipEmail:10.0.0.1:${hashIdentifier('user@example.com')}`);
    expect(checks.some((check) => check.key.includes('user@example.com'))).toBe(false);
  });

  it('skips the ip+email rule without an email', () => {
    expect(buildRateLimitChecks('sign-in', { ip: '10.0.0.1' }).map((c) => c.scope)).toEqual(['ip']);
  });

  it('uses a shared bucket for an unknown ip', () => {
    expect(buildRateLimitChecks('sign-up', { ip: null })[0]?.key).toBe(`sign-up:ip:${UNKNOWN_IP}`);
  });

  it('builds a per-user check', () => {
    expect(buildRateLimitChecks('change-password', { ip: '10.0.0.1', userId: 'u1' })).toEqual([
      {
        action: 'change-password',
        scope: 'user',
        key: 'change-password:user:u1',
        rule: RATE_LIMITS['change-password'].user,
      },
    ]);
  });
});
