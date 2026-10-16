import { describe, expect, it } from 'vitest';

import {
  extractMentions,
  filterMentionCandidates,
  findMentionQuery,
  mentionedUserIds,
  mentionText,
  resolveCommentRecipients,
} from './comment-mentions';

const anna = { userId: 'u-anna', name: 'Анна Петрова', email: 'anna@example.com' };
const anton = { userId: 'u-anton', name: 'Антон', email: 'a.smirnov@example.com' };
const petr = { userId: 'u-petr', name: 'Пётр Иванов', email: 'petr@example.com' };
const john = { userId: 'u-john', name: 'John Smith', email: 'john@example.com' };
const members = [anna, anton, petr, john];

describe('findMentionQuery', () => {
  it.each([
    ['@', 1, { start: 0, query: '' }],
    ['Привет, @Ан', 11, { start: 8, query: 'Ан' }],
    ['(@an', 4, { start: 1, query: 'an' }],
    ['@Анна Пе', 8, { start: 0, query: 'Анна Пе' }],
  ])('%j at %i → %j', (text, caret, expected) => {
    expect(findMentionQuery(text, caret)).toEqual(expected);
  });

  it.each([
    ['user@mail', 9],
    ['@Анна\nПе', 8],
    ['@Анна Петрова Ив', 16],
    ['@ Анна', 6],
    ['@Ан!', 4],
    ['без собаки', 10],
  ])('%j at %i → null', (text, caret) => {
    expect(findMentionQuery(text, caret)).toBeNull();
  });

  it('looks only left of the caret', () => {
    expect(findMentionQuery('@Анна и текст', 1)).toEqual({ start: 0, query: '' });
  });
});

describe('filterMentionCandidates', () => {
  it('returns everyone for an empty query', () => {
    expect(filterMentionCandidates(members, '')).toHaveLength(4);
  });

  it('ranks name prefix before word prefix and email', () => {
    const result = filterMentionCandidates(members, 'ан');
    // «Иванов» содержит «ан» — вхождение, последним.
    expect(result.map((member) => member.userId)).toEqual(['u-anna', 'u-anton', 'u-petr']);
  });

  it('matches any word of the name', () => {
    expect(filterMentionCandidates(members, 'петр').map((m) => m.userId)).toEqual([
      'u-petr',
      'u-anna',
    ]);
  });

  it('treats ё as е and matches email', () => {
    expect(filterMentionCandidates(members, 'пёт')[0]?.userId).toBe('u-petr');
    expect(filterMentionCandidates(members, 'a.smi')[0]?.userId).toBe('u-anton');
  });

  it('respects the limit', () => {
    expect(filterMentionCandidates(members, '', 2)).toHaveLength(2);
  });
});

describe('mentionText', () => {
  it('adds @ and a trailing space', () => {
    expect(mentionText(anna)).toBe('@Анна Петрова ');
  });
});

describe('extractMentions', () => {
  it('finds a full name with a space', () => {
    expect(extractMentions('@Анна Петрова, глянь', members)).toEqual([
      { start: 0, end: 13, userId: 'u-anna' },
    ]);
  });

  it('is case-insensitive and treats ё as е', () => {
    expect(mentionedUserIds('привет @петр иванов', members)).toEqual(['u-petr']);
  });

  it('prefers the longest match', () => {
    const ann = { userId: 'u-ann', name: 'Анна', email: 'ann@example.com' };
    expect(mentionedUserIds('@Анна Петрова', [ann, anna])).toEqual(['u-anna']);
    expect(mentionedUserIds('@Анна, привет', [ann, anna])).toEqual(['u-ann']);
  });

  it('matches the email local part', () => {
    expect(mentionedUserIds('cc @john', members)).toEqual(['u-john']);
  });

  it('requires a word boundary after the name', () => {
    expect(mentionedUserIds('@Антоний', members)).toEqual([]);
    expect(mentionedUserIds('@Антон.', members)).toEqual(['u-anton']);
  });

  it('ignores emails and unknown names', () => {
    expect(mentionedUserIds('пишите на anna@example.com', members)).toEqual([]);
    expect(mentionedUserIds('@Никто', members)).toEqual([]);
  });

  it('deduplicates ids but keeps every range', () => {
    const body = '@Антон и снова @антон';
    expect(extractMentions(body, members)).toHaveLength(2);
    expect(mentionedUserIds(body, members)).toEqual(['u-anton']);
  });
});

describe('resolveCommentRecipients', () => {
  it('excludes the actor and mentioned watchers', () => {
    expect(
      resolveCommentRecipients({
        actorId: 'u-anna',
        mentioned: ['u-anna', 'u-petr'],
        watchers: ['u-petr', 'u-john', null, 'u-anna'],
      }),
    ).toEqual({ mentions: ['u-petr'], watchers: ['u-john'] });
  });

  it('notifies only new mentions on edit', () => {
    expect(
      resolveCommentRecipients({
        actorId: 'u-anna',
        mentioned: ['u-petr', 'u-john'],
        previouslyMentioned: ['u-petr'],
      }),
    ).toEqual({ mentions: ['u-john'], watchers: [] });
  });
});
