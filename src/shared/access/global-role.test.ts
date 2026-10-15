import { describe, expect, it } from 'vitest';

import { isAdmin, parseGlobalRole } from './global-role';

describe('parseGlobalRole', () => {
  it.each([
    ['admin', 'admin'],
    ['user', 'user'],
    ['user, admin', 'admin'],
    ['superuser', 'user'],
    ['', 'user'],
    [null, 'user'],
    [undefined, 'user'],
  ] as const)('%s → %s', (input, expected) => {
    expect(parseGlobalRole(input)).toBe(expected);
  });
});

describe('isAdmin', () => {
  it('is true only for admin', () => {
    expect(isAdmin({ role: 'admin' })).toBe(true);
    expect(isAdmin({ role: 'user' })).toBe(false);
  });
});
