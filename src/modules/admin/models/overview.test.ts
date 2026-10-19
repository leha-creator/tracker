import { describe, expect, it } from 'vitest';

import { dailySeriesStart, fillDailySeries } from './overview';

describe('fillDailySeries', () => {
  const now = new Date('2026-10-19T15:30:00Z');

  it('fills missing days with zeros, oldest first', () => {
    expect(
      fillDailySeries(
        [
          { day: '2026-10-17', count: 2 },
          { day: '2026-10-19', count: 5 },
        ],
        3,
        now,
      ),
    ).toEqual([
      { day: '2026-10-17', count: 2 },
      { day: '2026-10-18', count: 0 },
      { day: '2026-10-19', count: 5 },
    ]);
  });

  it('drops rows outside the period and crosses month boundaries', () => {
    const series = fillDailySeries([{ day: '2026-09-01', count: 9 }], 30, now);
    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ day: '2026-09-20', count: 0 });
    expect(series.every((point) => point.count === 0)).toBe(true);
  });
});

describe('dailySeriesStart', () => {
  it('starts at UTC midnight days - 1 ago', () => {
    expect(dailySeriesStart(new Date('2026-10-19T00:10:00Z'), 30).toISOString()).toBe(
      '2026-09-20T00:00:00.000Z',
    );
  });
});
