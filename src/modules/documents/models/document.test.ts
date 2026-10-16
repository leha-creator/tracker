import { describe, expect, it } from 'vitest';

import {
  assertDocumentTagsLimit,
  assertNoteVersion,
  assertStorageQuota,
  assertTaskLinksLimit,
  DOCUMENT_TAGS_LIMIT,
  documentTitleKey,
  isDocumentEntityId,
  normalizeDocumentTitle,
  normalizeNoteContent,
  NOTE_CONTENT_MAX_LENGTH,
  noteExportFileName,
  TASK_DOCUMENT_LINKS_LIMIT,
} from './document';
import {
  normalizeTagName,
  parseTagColor,
  tagNameKey,
  assertWorkspaceTagsLimit,
  WORKSPACE_TAGS_LIMIT,
} from './document-tag';

describe('document title', () => {
  it('normalizes and keys', () => {
    expect(normalizeDocumentTitle('  Регламент   релизов ')).toBe('Регламент релизов');
    expect(documentTitleKey('Регламент')).toBe('регламент');
  });

  it('rejects empty and too long titles on the title field', () => {
    expect(() => normalizeDocumentTitle(' ')).toThrow(/Введите/);
    expect(() => normalizeDocumentTitle('x'.repeat(201))).toThrow(/200/);
  });
});

describe('note content', () => {
  it('normalizes line endings', () => {
    expect(normalizeNoteContent('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('limits length', () => {
    expect(() => normalizeNoteContent('x'.repeat(NOTE_CONTENT_MAX_LENGTH))).not.toThrow();
    expect(() => normalizeNoteContent('x'.repeat(NOTE_CONTENT_MAX_LENGTH + 1))).toThrow();
  });
});

describe('assertNoteVersion', () => {
  it('throws CONFLICT on mismatch', () => {
    expect(() => assertNoteVersion(3, 3)).not.toThrow();
    expect(() => assertNoteVersion(3, 4)).toThrow(
      expect.objectContaining({ code: 'CONFLICT' }) as Error,
    );
  });
});

describe('limits', () => {
  it('limits tags per document', () => {
    expect(() => assertDocumentTagsLimit(DOCUMENT_TAGS_LIMIT)).not.toThrow();
    expect(() => assertDocumentTagsLimit(DOCUMENT_TAGS_LIMIT + 1)).toThrow();
  });

  it('limits links per task', () => {
    expect(() => assertTaskLinksLimit(TASK_DOCUMENT_LINKS_LIMIT - 1)).not.toThrow();
    expect(() => assertTaskLinksLimit(TASK_DOCUMENT_LINKS_LIMIT)).toThrow();
  });

  it('limits tags per workspace', () => {
    expect(() => assertWorkspaceTagsLimit(WORKSPACE_TAGS_LIMIT - 1)).not.toThrow();
    expect(() => assertWorkspaceTagsLimit(WORKSPACE_TAGS_LIMIT)).toThrow();
  });
});

describe('assertStorageQuota', () => {
  it('allows filling the quota exactly', () => {
    expect(() =>
      assertStorageQuota({ usedBytes: 900, incomingBytes: 100, quotaBytes: 1000 }),
    ).not.toThrow();
  });

  it('rejects exceeding the quota with the free space', () => {
    expect(() =>
      assertStorageQuota({ usedBytes: 900, incomingBytes: 101, quotaBytes: 1000 }),
    ).toThrow(/свободно 100 Б/);
  });

  it('reports zero free space when already over quota', () => {
    expect(() =>
      assertStorageQuota({ usedBytes: 1200, incomingBytes: 1, quotaBytes: 1000 }),
    ).toThrow(/свободно 0 Б/);
  });
});

describe('misc', () => {
  it('validates entity ids', () => {
    expect(isDocumentEntityId('0199f3a4-1b2c-7d3e-8f40-123456789abc')).toBe(true);
    expect(isDocumentEntityId('../etc')).toBe(false);
  });

  it('builds a safe export file name', () => {
    expect(noteExportFileName('План: Q1/Q2')).toBe('План_ Q1_Q2.md');
    expect(noteExportFileName('///')).toBe('___.md');
  });
});

describe('tags', () => {
  it('normalizes names', () => {
    expect(normalizeTagName('  #важное   ')).toBe('важное');
    expect(tagNameKey('API')).toBe('api');
    expect(() => normalizeTagName('#')).toThrow();
    expect(() => normalizeTagName('a,b')).toThrow(/запятую/);
    expect(() => normalizeTagName('x'.repeat(33))).toThrow();
  });

  it('parses colors with a fallback', () => {
    expect(parseTagColor('blue')).toBe('blue');
    expect(parseTagColor('pink')).toBe('gray');
    expect(parseTagColor(null)).toBe('gray');
  });
});
