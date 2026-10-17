import { describe, expect, it } from 'vitest';

import { pickReminderRecipients, reminderDates } from './due-reminders';

describe('reminderDates', () => {
  it('считает сутки в часовом поясе, а не в UTC', () => {
    // 22:30 UTC 17 октября — в Москве (UTC+3) уже 18 октября.
    const now = new Date('2026-10-17T22:30:00.000Z');
    expect(reminderDates(now, 'Europe/Moscow')).toEqual({
      today: '2026-10-18',
      tomorrow: '2026-10-19',
    });
    expect(reminderDates(now, 'UTC')).toEqual({ today: '2026-10-17', tomorrow: '2026-10-18' });
  });

  it('пояс западнее UTC отстаёт на сутки', () => {
    const now = new Date('2026-10-18T02:00:00.000Z');
    expect(reminderDates(now, 'America/New_York').today).toBe('2026-10-17');
  });

  it('переход через месяц и год', () => {
    expect(reminderDates(new Date('2026-12-31T12:00:00.000Z'), 'UTC')).toEqual({
      today: '2026-12-31',
      tomorrow: '2027-01-01',
    });
  });
});

describe('pickReminderRecipients', () => {
  it('срок завтра — только ответственному', () => {
    expect(pickReminderRecipients('due_soon', 'u1', ['u2', 'u3'])).toEqual(['u1']);
  });

  it('просрочка — ответственному и наблюдателям без повторов', () => {
    expect(pickReminderRecipients('overdue', 'u1', ['u2', 'u1', 'u3'])).toEqual(['u1', 'u2', 'u3']);
  });

  it('без ответственного о сроке завтра напоминать некому', () => {
    expect(pickReminderRecipients('due_soon', null, ['u2'])).toEqual([]);
    expect(pickReminderRecipients('overdue', null, ['u2'])).toEqual(['u2']);
  });
});
