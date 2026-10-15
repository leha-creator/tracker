import { describe, expect, it } from 'vitest';

import {
  assertCanCreateProject,
  assertDeleteConfirmed,
  normalizeProjectName,
  PROJECT_LIMIT,
} from './project';
import { parseStatusColor } from './status-color';

describe('normalizeProjectName', () => {
  it.each([
    ['  Сайт  ', 'Сайт'],
    ['Мобильное    приложение', 'Мобильное приложение'],
    ['Back\toffice', 'Back office'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeProjectName(input)).toBe(expected);
  });
});

describe('assertDeleteConfirmed', () => {
  it('accepts exact name with extra spaces', () => {
    expect(() => assertDeleteConfirmed('Сайт', '  Сайт ')).not.toThrow();
  });

  it.each(['сайт', 'Сайт 2', ''])('rejects %j', (confirm) => {
    expect(() => assertDeleteConfirmed('Сайт', confirm)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR', fieldErrors: expect.any(Object) }),
    );
  });
});

describe('assertCanCreateProject', () => {
  it('allows below the limit and rejects at the limit', () => {
    expect(() => assertCanCreateProject(PROJECT_LIMIT - 1)).not.toThrow();
    expect(() => assertCanCreateProject(PROJECT_LIMIT)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});

describe('parseStatusColor', () => {
  it('keeps known colors and falls back to gray', () => {
    expect(parseStatusColor('violet')).toBe('violet');
    expect(parseStatusColor('pink')).toBe('gray');
    expect(parseStatusColor(null)).toBe('gray');
  });
});
