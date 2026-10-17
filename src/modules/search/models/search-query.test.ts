import { describe, expect, it } from 'vitest';

import {
  isSearchableQuery,
  matchRank,
  normalizeSearchQuery,
  pickMatches,
  SEARCH_QUERY_MAX_LENGTH,
} from './search-query';

describe('normalizeSearchQuery', () => {
  it('обрезает и сжимает пробелы', () => {
    expect(normalizeSearchQuery('  починить   доску \n')).toBe('починить доску');
  });

  it('ограничивает длину', () => {
    expect(normalizeSearchQuery('a'.repeat(300))).toHaveLength(SEARCH_QUERY_MAX_LENGTH);
  });
});

describe('isSearchableQuery', () => {
  it('требует 2 символа', () => {
    expect(isSearchableQuery('')).toBe(false);
    expect(isSearchableQuery('д')).toBe(false);
    expect(isSearchableQuery('до')).toBe(true);
  });

  it('пропускает номер задачи из одной цифры', () => {
    expect(isSearchableQuery('7')).toBe(true);
    expect(isSearchableQuery('#7')).toBe(true);
  });
});

describe('matchRank', () => {
  it('начало строки выше начала слова, а то выше середины', () => {
    expect(matchRank('Анна Петрова', 'ан')).toBe(0);
    expect(matchRank('Анна Петрова', 'пе')).toBe(1);
    expect(matchRank('anna@example.com', 'exa')).toBe(1);
    expect(matchRank('Анна Петрова', 'тро')).toBe(2);
    expect(matchRank('Анна Петрова', 'иван')).toBeNull();
  });

  it('не различает регистр и ё/е', () => {
    expect(matchRank('Пётр', 'ПЕТ')).toBe(0);
  });

  it('пустой запрос не совпадает', () => {
    expect(matchRank('Анна', '')).toBeNull();
  });
});

describe('pickMatches', () => {
  const people = [
    { name: 'Борис Ананьев', email: 'boris@example.com' },
    { name: 'Анна', email: 'a@example.com' },
    { name: 'Вера', email: 'vera@example.com' },
    { name: 'Андрей', email: 'andrey@example.com' },
  ];
  const fields = (p: (typeof people)[number]) => [p.name, p.email];

  it('ищет по всем полям и сортирует по рангу, затем по имени', () => {
    expect(pickMatches(people, 'ан', fields).map((p) => p.name)).toEqual([
      'Андрей',
      'Анна',
      'Борис Ананьев',
    ]);
  });

  it('ограничивает число результатов', () => {
    expect(pickMatches(people, 'example', fields, 2)).toHaveLength(2);
  });
});
