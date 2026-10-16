import { describe, expect, it } from 'vitest';

import { getClientIp } from './client-ip';

describe('getClientIp', () => {
  it('takes the first address from X-Forwarded-For', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('supports IPv6', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('falls back to X-Real-IP', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': ' ', 'x-real-ip': '198.51.100.2' }))).toBe(
      '198.51.100.2',
    );
  });

  it('returns null without headers', () => {
    expect(getClientIp(new Headers())).toBeNull();
  });
});
