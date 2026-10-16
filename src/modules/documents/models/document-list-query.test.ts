import { describe, expect, it } from 'vitest';

import {
  clearDocumentFilters,
  defaultDocumentListQuery,
  documentKindCondition,
  documentPageCount,
  isDocumentSearch,
  parseDocumentListParams,
  patchDocumentListQuery,
  serializeDocumentListParams,
} from './document-list-query';

const FOLDER = '0199f3a4-1b2c-7d3e-8f40-123456789abc';
const TAG = '0199f3a4-1b2c-7d3e-8f40-cba987654321';

describe('parseDocumentListParams', () => {
  it('returns defaults for empty params', () => {
    expect(parseDocumentListParams({})).toEqual(defaultDocumentListQuery());
  });

  it('parses valid params', () => {
    expect(
      parseDocumentListParams({
        folder: FOLDER,
        q: '  регламент   релизов ',
        tag: TAG,
        kind: 'pdf',
        sort: 'updated',
        page: '3',
      }),
    ).toEqual({
      folder: FOLDER,
      q: 'регламент релизов',
      tag: TAG,
      kind: 'pdf',
      sort: 'updated',
      dir: 'desc',
      page: 3,
    });
  });

  it('drops invalid values', () => {
    expect(
      parseDocumentListParams({
        folder: '../x',
        tag: 'nope',
        kind: 'exe',
        sort: 'size',
        dir: 'up',
        page: '0',
        q: 'x'.repeat(500),
      }),
    ).toEqual({ ...defaultDocumentListQuery(), q: 'x'.repeat(100) });
  });

  it('takes the first value of repeated params', () => {
    expect(parseDocumentListParams({ kind: ['note', 'pdf'] }).kind).toBe('note');
  });
});

describe('serializeDocumentListParams', () => {
  it('omits defaults and round-trips', () => {
    expect(serializeDocumentListParams(defaultDocumentListQuery())).toBe('');
    const query = {
      ...defaultDocumentListQuery(),
      folder: FOLDER,
      q: 'план',
      sort: 'name' as const,
      dir: 'desc' as const,
      page: 2,
    };
    const serialized = serializeDocumentListParams(query);
    expect(serialized).toBe(`folder=${FOLDER}&q=%D0%BF%D0%BB%D0%B0%D0%BD&dir=desc&page=2`);
    expect(parseDocumentListParams(Object.fromEntries(new URLSearchParams(serialized)))).toEqual(
      query,
    );
  });
});

describe('patchDocumentListQuery', () => {
  it('resets the page on filter change and keeps it on page change', () => {
    const query = { ...defaultDocumentListQuery(), page: 4 };
    expect(patchDocumentListQuery(query, { q: 'x' }).page).toBe(1);
    expect(patchDocumentListQuery(query, { page: 5 }).page).toBe(5);
  });

  it('applies the default direction of a new sort', () => {
    expect(patchDocumentListQuery(defaultDocumentListQuery(), { sort: 'updated' }).dir).toBe(
      'desc',
    );
  });
});

describe('search mode', () => {
  it('is a search when q, tag or kind is set', () => {
    expect(isDocumentSearch(defaultDocumentListQuery())).toBe(false);
    expect(isDocumentSearch({ ...defaultDocumentListQuery(), folder: FOLDER })).toBe(false);
    expect(isDocumentSearch({ ...defaultDocumentListQuery(), kind: 'note' })).toBe(true);
  });

  it('clears filters but keeps the folder and sort', () => {
    const query = {
      ...defaultDocumentListQuery(),
      folder: FOLDER,
      q: 'x',
      tag: TAG,
      sort: 'updated' as const,
      dir: 'desc' as const,
    };
    expect(clearDocumentFilters(query)).toEqual({
      ...defaultDocumentListQuery(),
      folder: FOLDER,
      sort: 'updated',
      dir: 'desc',
    });
  });
});

describe('documentKindCondition', () => {
  it('maps filters to conditions', () => {
    expect(documentKindCondition('note')).toEqual({ kind: 'note' });
    const media = documentKindCondition('media');
    expect(media).toMatchObject({ kind: 'file', exclude: false });
    expect(media.kind === 'file' && media.extensions).toEqual(
      expect.arrayContaining(['mp3', 'mp4']),
    );
    const other = documentKindCondition('other');
    expect(other).toMatchObject({ kind: 'file', exclude: true });
    expect(other.kind === 'file' && other.extensions).toEqual(
      expect.arrayContaining(['png', 'pdf', 'md', 'mp4']),
    );
  });
});

describe('documentPageCount', () => {
  it('is at least one', () => {
    expect(documentPageCount(0)).toBe(1);
    expect(documentPageCount(101, 50)).toBe(3);
  });
});
