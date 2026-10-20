import { describe, expect, it } from 'vitest';

import { packIco } from './ico.mjs';

describe('packIco', () => {
  it('пишет заголовок и таблицу записей', () => {
    const a = Buffer.from([1, 2, 3]);
    const b = Buffer.from([4, 5]);
    const ico = packIco([
      { size: 16, data: a },
      { size: 256, data: b },
    ]);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    // Первая запись: 16×16, 3 байта сразу после таблицы.
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt16LE(6 + 6)).toBe(32);
    expect(ico.readUInt32LE(6 + 8)).toBe(3);
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + 16 * 2);
    // Вторая запись: 256 кодируется нулём.
    expect(ico.readUInt8(22)).toBe(0);
    expect(ico.readUInt32LE(22 + 12)).toBe(6 + 16 * 2 + 3);
    expect([...ico.subarray(-5)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('отклоняет пустой список и размер больше 256', () => {
    expect(() => packIco([])).toThrow();
    expect(() => packIco([{ size: 512, data: Buffer.alloc(1) }])).toThrow();
  });
});
