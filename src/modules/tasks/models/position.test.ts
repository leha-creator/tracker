import { describe, expect, it } from 'vitest';

import { comparePositions, positionAfter, positionBetween, rekeyColumn } from './position';

describe('rekeyColumn', () => {
  it('returns no keys for an empty column', () => {
    expect(rekeyColumn(0)).toEqual([]);
  });

  it('returns strictly increasing keys (byte order)', () => {
    const keys = rekeyColumn(50);
    expect(keys).toHaveLength(50);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });
});

describe('positionAfter', () => {
  it('starts an empty column', () => {
    expect(positionAfter(null)).toEqual(expect.any(String));
  });

  it('produces strictly increasing keys (byte order)', () => {
    let last: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 100; i++) {
      last = positionAfter(last);
      keys.push(last);
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });
});

describe('positionBetween', () => {
  it('returns a key strictly between neighbours', () => {
    const a = positionAfter(null);
    const b = positionAfter(a);
    const mid = positionBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
  });

  it('supports open ends', () => {
    const a = positionAfter(null);
    expect(positionBetween(null, a) < a).toBe(true);
    expect(positionBetween(a, null) > a).toBe(true);
  });
});

describe('comparePositions', () => {
  it('compares bytes, not locale (uppercase before lowercase)', () => {
    expect(comparePositions({ position: 'Zz', taskId: 'x' }, { position: 'a0', taskId: 'x' })).toBe(
      -1,
    );
  });

  it('breaks ties by task id', () => {
    const items = [
      { position: 'a1', taskId: 'b' },
      { position: 'a1', taskId: 'a' },
      { position: 'a0', taskId: 'z' },
    ];
    expect(items.sort(comparePositions).map((item) => item.taskId)).toEqual(['z', 'a', 'b']);
  });
});
