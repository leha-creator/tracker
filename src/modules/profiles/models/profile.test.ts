import { describe, expect, it } from 'vitest';

import { emptyToNull, normalizeProfileBio, normalizeProfileLine } from './profile';

describe('normalizeProfileLine', () => {
  it.each([
    ['  Анна  ', 'Анна'],
    ['Старший   разработчик', 'Старший разработчик'],
    ['a\nb', 'a b'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeProfileLine(input)).toBe(expected);
  });
});

describe('normalizeProfileBio', () => {
  it('keeps paragraphs and trims', () => {
    expect(normalizeProfileBio('  Привет \r\n\n\n\nМир\t ')).toBe('Привет\n\nМир');
  });
});

describe('emptyToNull', () => {
  it('maps empty string to null', () => {
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull('x')).toBe('x');
  });
});
