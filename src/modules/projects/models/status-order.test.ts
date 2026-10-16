import { describe, expect, it } from 'vitest';

import { reorderStatuses } from './status-order';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const ids = (result: ReturnType<typeof reorderStatuses<{ id: string }>>) =>
  result?.items.map((item) => item.id);

describe('reorderStatuses', () => {
  it('moves a status down onto another one', () => {
    const result = reorderStatuses(items, 'a', 'c');
    expect(ids(result)).toEqual(['b', 'c', 'a', 'd']);
    expect(result?.prevStatusId).toBe('c');
  });

  it('moves a status up onto another one', () => {
    const result = reorderStatuses(items, 'd', 'b');
    expect(ids(result)).toEqual(['a', 'd', 'b', 'c']);
    expect(result?.prevStatusId).toBe('a');
  });

  it('moves a status to the start', () => {
    const result = reorderStatuses(items, 'c', 'a');
    expect(ids(result)).toEqual(['c', 'a', 'b', 'd']);
    expect(result?.prevStatusId).toBeNull();
  });

  it('moves a status to the end', () => {
    const result = reorderStatuses(items, 'b', 'd');
    expect(ids(result)).toEqual(['a', 'c', 'd', 'b']);
    expect(result?.prevStatusId).toBe('d');
  });

  it('returns null when dropped on itself', () => {
    expect(reorderStatuses(items, 'b', 'b')).toBeNull();
  });

  it('returns null for unknown ids', () => {
    expect(reorderStatuses(items, 'x', 'b')).toBeNull();
    expect(reorderStatuses(items, 'b', 'x')).toBeNull();
  });

  it('does not mutate the input', () => {
    reorderStatuses(items, 'a', 'd');
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
