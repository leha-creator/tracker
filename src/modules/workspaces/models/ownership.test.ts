import { describe, expect, it } from 'vitest';

import { assertCanTransferOwnership } from './ownership';

describe('assertCanTransferOwnership', () => {
  it('allows a human member', () => {
    expect(() =>
      assertCanTransferOwnership({ role: 'member', isAgent: false }, false),
    ).not.toThrow();
  });

  it('rejects a non-member with NOT_FOUND', () => {
    expect(() => assertCanTransferOwnership(null, false)).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('rejects an agent', () => {
    expect(() => assertCanTransferOwnership({ role: 'member', isAgent: true }, true)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('rejects an owner unless other owners are demoted', () => {
    expect(() => assertCanTransferOwnership({ role: 'owner', isAgent: false }, false)).toThrow(
      /уже владелец/,
    );
    expect(() => assertCanTransferOwnership({ role: 'owner', isAgent: false }, true)).not.toThrow();
  });
});
