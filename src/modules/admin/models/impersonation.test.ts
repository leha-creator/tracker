import { describe, expect, it } from 'vitest';

import { assertCanImpersonate, type ImpersonationTarget } from './impersonation';

function target(overrides: Partial<ImpersonationTarget> = {}): ImpersonationTarget {
  return { id: 'user-2', role: 'user', isAgent: false, bannedNow: false, ...overrides };
}

describe('assertCanImpersonate', () => {
  it('allows an active regular user', () => {
    expect(() => assertCanImpersonate('admin-1', target())).not.toThrow();
  });

  it('forbids yourself', () => {
    expect(() => assertCanImpersonate('user-2', target())).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it.each([
    ['an admin', { role: 'admin' as const }],
    ['an agent', { isAgent: true }],
    ['a banned user', { bannedNow: true }],
  ])('rejects %s', (_name, overrides) => {
    expect(() => assertCanImpersonate('admin-1', target(overrides))).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});
