import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/shared/errors/app-error';

import {
  normalizeTaskKey,
  suggestTaskKey,
  taskKeyProblem,
  taskKeyWithSuffix,
  validateTaskKey,
} from './task-key';

describe('normalizeTaskKey', () => {
  it('trims and uppercases', () => {
    expect(normalizeTaskKey('  tsk ')).toBe('TSK');
  });
});

describe('taskKeyProblem', () => {
  it.each(['TS', 'TSK', 'WEB2', 'A1234567B9'])('%s is valid', (key) => {
    expect(taskKeyProblem(key)).toBeNull();
  });

  it.each([
    ['T', 'длина'],
    ['A12345678901', 'длина'],
    ['2TSK', 'первая буква'],
    ['TS-K', 'дефис'],
    ['ТСК', 'кириллица'],
  ])('%s is invalid (%s)', (key) => {
    expect(taskKeyProblem(key)).not.toBeNull();
  });
});

describe('validateTaskKey', () => {
  it('returns normalized key', () => {
    expect(validateTaskKey(' web ')).toBe('WEB');
  });

  it('throws field error for taskKey', () => {
    try {
      validateTaskKey('1');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors?.taskKey).toHaveLength(1);
    }
  });
});

describe('suggestTaskKey', () => {
  it.each([
    ['Отдел продаж', 'OP'],
    ['Маркетинг', 'MAR'],
    ['Tasker', 'TAS'],
    ['Web Design Team Alpha Beta', 'WDTA'],
    ['42 команда', 'W4K'],
    ['2025', 'W202'],
    ['Q', 'QX'],
    ['🚀', 'WS'],
    ['', 'WS'],
  ])('%s → %s', (name, key) => {
    const suggested = suggestTaskKey(name);
    expect(suggested).toBe(key);
    expect(taskKeyProblem(suggested)).toBeNull();
  });
});

describe('taskKeyWithSuffix', () => {
  it('appends attempt number starting from 2', () => {
    expect(taskKeyWithSuffix('TSK', 1)).toBe('TSK2');
    expect(taskKeyWithSuffix('TSK', 9)).toBe('TSK10');
  });

  it('keeps max length', () => {
    expect(taskKeyWithSuffix('ABCDEFGHIJ', 1)).toBe('ABCDEFGHI2');
    expect(taskKeyWithSuffix('ABCDEFGHIJ', 11)).toBe('ABCDEFGH12');
  });
});
