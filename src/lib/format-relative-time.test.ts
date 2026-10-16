import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './format-relative-time';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('says "только что" within a minute', () => {
    expect(formatRelativeTime(new Date(NOW - 20_000), NOW)).toBe('только что');
  });

  it('uses minutes, hours and days', () => {
    expect(formatRelativeTime(new Date(NOW - 5 * 60_000), NOW)).toBe('5 минут назад');
    expect(formatRelativeTime(new Date(NOW - 2 * 3_600_000), NOW)).toBe('2 часа назад');
    expect(formatRelativeTime(new Date(NOW - 24 * 3_600_000), NOW)).toBe('вчера');
  });

  it('falls back to a date after a week', () => {
    expect(formatRelativeTime('2026-10-01T12:00:00.000Z', NOW)).toMatch(/1 окт/);
  });
});
