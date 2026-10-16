import { describe, expect, it } from 'vitest';

import type { DocumentDto, DocumentFolderDto, LinkedDocumentDto } from '@/modules/documents/client';

import {
  formatDocument,
  formatDocumentList,
  formatFolderTree,
  MCP_DOCUMENT_TEXT_MAX_BYTES,
  resolveFolder,
  resolveTag,
  truncateUtf8,
} from './documents';

const FOLDERS: DocumentFolderDto[] = [
  { id: 'f-1', parentId: null, name: 'Specs', documentsCount: 2 },
  { id: 'f-2', parentId: 'f-1', name: 'API', documentsCount: 1 },
  { id: 'f-3', parentId: null, name: 'API', documentsCount: 0 },
];

function summary(overrides: Partial<LinkedDocumentDto> = {}): LinkedDocumentDto {
  return {
    id: 'doc-1',
    kind: 'note',
    title: 'ADR-1',
    folderId: null,
    extension: null,
    fileKind: null,
    viewer: null,
    size: null,
    tags: [],
    createdBy: { userId: 'u-1', name: 'Анна', image: null },
    updatedBy: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    folderPath: '',
    ...overrides,
  };
}

function document(overrides: Partial<DocumentDto> = {}): DocumentDto {
  const { folderPath: _folderPath, ...base } = summary();
  return {
    ...base,
    workspaceId: 'ws-1',
    workspaceSlug: 'team',
    version: 3,
    content: '# ADR',
    fileName: null,
    inlineViewable: false,
    createdVia: null,
    ...overrides,
  };
}

describe('truncateUtf8', () => {
  it('keeps short text and cuts long text on a character boundary', () => {
    expect(truncateUtf8('привет', 100)).toEqual({ text: 'привет', truncated: false });
    // «п» — 2 байта: 3 байта влезают только в одну букву.
    expect(truncateUtf8('привет', 3)).toEqual({ text: 'п', truncated: true });
  });
});

describe('resolveFolder / resolveTag', () => {
  it('finds a folder by id, unique name or path; ambiguous name asks for id', () => {
    expect(resolveFolder(FOLDERS, 'f-2').id).toBe('f-2');
    expect(resolveFolder(FOLDERS, 'specs').id).toBe('f-1');
    expect(resolveFolder(FOLDERS, 'Specs / API').id).toBe('f-2');
    // Путь «API» — папка в корне, хотя такое имя есть и внутри Specs.
    expect(resolveFolder(FOLDERS, 'API').id).toBe('f-3');
    const twins = [
      ...FOLDERS,
      { id: 'f-4', parentId: 'f-1', name: 'Drafts', documentsCount: 0 },
      { id: 'f-5', parentId: 'f-3', name: 'Drafts', documentsCount: 0 },
    ];
    expect(() => resolveFolder(twins, 'Drafts')).toThrow(/неоднозначен/);
    expect(() => resolveFolder(FOLDERS, 'Нет такой')).toThrow(/не найден/);
  });

  it('finds only existing tags', () => {
    const tags = [{ id: 't-1', name: 'Архитектура', color: 'blue' as const, documentsCount: 1 }];
    expect(resolveTag(tags, 'архитектура').id).toBe('t-1');
    expect(() => resolveTag(tags, 'Новый')).toThrow(/не найден/);
  });
});

describe('formatDocumentList and formatFolderTree', () => {
  it('lists folders and documents with ids', () => {
    const text = formatDocumentList({
      path: [],
      folders: [FOLDERS[0]!],
      documents: [
        summary(),
        summary({ id: 'doc-2', kind: 'file', title: 'Схема', extension: 'png', size: 2048 }),
      ],
      isSearch: false,
      total: 2,
      page: 1,
      pageCount: 1,
      pageSize: 50,
    });
    expect(text).toContain('Specs/ (id f-1');
    expect(text).toContain('**ADR-1** (note, id doc-1)');
    expect(text).toContain('**Схема** (file .png, 2 КБ, id doc-2)');
  });

  it('draws the folder tree', () => {
    const text = formatFolderTree(FOLDERS);
    expect(text).toContain('- Specs/ (id f-1');
    expect(text).toContain('  - API/ (id f-2');
  });
});

describe('formatDocument', () => {
  const base = { folderPath: 'Specs', tasks: [], url: 'http://x/w/team/docs/doc-1' };

  it('shows a note with its version and content', () => {
    const text = formatDocument({
      ...base,
      document: document(),
      body: { kind: 'note', content: '# ADR\nРешение' },
    });
    expect(text).toContain('version: 3');
    expect(text).toContain('Решение');
  });

  it('cuts a long text file and marks it', () => {
    const text = formatDocument({
      ...base,
      document: document({ kind: 'file', extension: 'log', content: null }),
      body: { kind: 'text', text: 'x'.repeat(MCP_DOCUMENT_TEXT_MAX_BYTES + 10), truncated: false },
    });
    expect(text).toContain('only the beginning is shown');
    expect(text).not.toContain('version:');
  });

  it('gives a download link for a binary file', () => {
    const text = formatDocument({
      ...base,
      document: document({ kind: 'file', extension: 'png', content: null }),
      body: { kind: 'link', url: 'https://s3/signed' },
      tasks: [{ id: 't', number: 42, key: 'TSK-42', title: 'Вход', isDone: false }],
    });
    expect(text).toContain('https://s3/signed');
    expect(text).toContain('- TSK-42 Вход');
  });
});
