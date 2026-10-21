import { describe, expect, it } from 'vitest';

import { isAvatarUrl } from './avatar';

describe('isAvatarUrl', () => {
  it('accepts the agent robot', () => {
    expect(isAvatarUrl('/agent-avatar.svg')).toBe(true);
  });

  it('accepts IdP avatar paths served by the app', () => {
    expect(isAvatarUrl('/api/idp-avatar/u1?v=3')).toBe(true);
    expect(isAvatarUrl('/api/idp-avatar/u1')).toBe(false);
  });

  it('rejects external and legacy urls', () => {
    expect(isAvatarUrl('https://auth.plwedding.ru/api/users/u1/avatar?v=3')).toBe(false);
    expect(isAvatarUrl('https://evil.example/pixel.png')).toBe(false);
    expect(isAvatarUrl('/api/users/u1/avatar?v=abc')).toBe(false);
    expect(isAvatarUrl(null)).toBe(false);
  });
});
