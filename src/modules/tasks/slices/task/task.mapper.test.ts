import { describe, expect, it } from 'vitest';

import { toCreatedVia } from './task.mapper';

describe('toCreatedVia', () => {
  it('marks a human author who worked through a token', () => {
    expect(toCreatedVia({ isAgent: false }, { name: 'Ноутбук' })).toEqual({ tokenName: 'Ноутбук' });
  });

  it('hides the mark for an agent author and without a token', () => {
    expect(toCreatedVia({ isAgent: true }, { name: 'CI' })).toBeNull();
    expect(toCreatedVia({ isAgent: false }, null)).toBeNull();
    expect(toCreatedVia(null, { name: 'CI' })).toBeNull();
  });
});
