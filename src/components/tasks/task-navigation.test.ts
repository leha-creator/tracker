import { describe, expect, it } from 'vitest';

import { adjacentTaskNumber } from './task-navigation';

describe('adjacentTaskNumber', () => {
  const order = [12, 7, 30];

  it('returns the next and previous task', () => {
    expect(adjacentTaskNumber(order, 7, 1)).toBe(30);
    expect(adjacentTaskNumber(order, 7, -1)).toBe(12);
  });

  it('stops at the edges', () => {
    expect(adjacentTaskNumber(order, 30, 1)).toBeNull();
    expect(adjacentTaskNumber(order, 12, -1)).toBeNull();
  });

  it('returns null for a task outside the order', () => {
    expect(adjacentTaskNumber(order, 99, 1)).toBeNull();
    expect(adjacentTaskNumber([], 1, 1)).toBeNull();
  });
});
