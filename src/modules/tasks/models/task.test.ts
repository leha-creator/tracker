import { describe, expect, it } from 'vitest';

import {
  assertAssigneeIsMember,
  assertCanDeleteTask,
  formatTaskKey,
  isTaskOverdue,
  normalizeTaskTitle,
  parseTaskNumber,
  toIsoDate,
} from './task';

describe('normalizeTaskTitle', () => {
  it.each([
    ['  Сверстать  шапку ', 'Сверстать шапку'],
    ['Back\toffice\nlogin', 'Back office login'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeTaskTitle(input)).toBe(expected);
  });
});

describe('parseTaskNumber', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['abc', null],
    ['007', null],
    ['', null],
    ['12345678901', null],
  ])('%j → %j', (input, expected) => {
    expect(parseTaskNumber(input)).toBe(expected);
  });
});

describe('formatTaskKey', () => {
  it('prefixes number with #', () => {
    expect(formatTaskKey(42)).toBe('#42');
  });
});

describe('assertCanDeleteTask', () => {
  const task = { createdById: 'author' };

  it('allows the author', () => {
    expect(() => assertCanDeleteTask(task, { userId: 'author', role: 'member' })).not.toThrow();
  });

  it('allows a workspace owner', () => {
    expect(() => assertCanDeleteTask(task, { userId: 'boss', role: 'owner' })).not.toThrow();
  });

  it('rejects another member', () => {
    expect(() => assertCanDeleteTask(task, { userId: 'other', role: 'member' })).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('rejects a member when author is unknown', () => {
    expect(() =>
      assertCanDeleteTask({ createdById: null }, { userId: 'other', role: 'member' }),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});

describe('assertAssigneeIsMember', () => {
  it('rejects a non-member with field error', () => {
    expect(() => assertAssigneeIsMember(false)).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        fieldErrors: { assigneeId: expect.any(Array) },
      }),
    );
    expect(() => assertAssigneeIsMember(true)).not.toThrow();
  });
});

describe('isTaskOverdue', () => {
  const today = '2026-10-15';

  it.each([
    [null, ['todo'], false],
    ['2026-10-15', ['todo'], false],
    ['2026-10-16', ['todo'], false],
    ['2026-10-14', ['todo'], true],
    ['2026-10-14', [], true],
    ['2026-10-14', ['done'], false],
    ['2026-10-14', ['done', 'in_progress'], true],
    ['2026-10-14', ['done', 'done'], false],
  ] as const)('due %j with %j → %j', (due, categories, expected) => {
    expect(isTaskOverdue(due, today, categories)).toBe(expected);
  });
});

describe('toIsoDate', () => {
  it('formats in UTC', () => {
    expect(toIsoDate(new Date('2026-02-03T00:00:00.000Z'))).toBe('2026-02-03');
  });
});
