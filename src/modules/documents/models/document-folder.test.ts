import { describe, expect, it } from 'vitest';

import {
  assertCanCreateFolderIn,
  assertCanMoveFolder,
  FOLDER_MAX_DEPTH,
  folderNameKey,
  folderPath,
  formatFolderPath,
  normalizeFolderName,
} from './document-folder';

describe('normalizeFolderName', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeFolderName('  Спецификации   API  ')).toBe('Спецификации API');
  });

  it.each(['', '   ', '.', '..', 'a/b', 'a\\b', 'a:b', 'what?', 'x'.repeat(101)])(
    'rejects %j',
    (name) => {
      expect(() => normalizeFolderName(name)).toThrow();
    },
  );

  it('reports the error on the name field', () => {
    try {
      normalizeFolderName('a/b');
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ fieldErrors: { name: [expect.any(String)] } });
    }
  });

  it('builds a case-insensitive key', () => {
    expect(folderNameKey('Договоры')).toBe(folderNameKey('ДОГОВОРЫ'));
  });
});

describe('assertCanCreateFolderIn', () => {
  it('limits depth', () => {
    expect(() => assertCanCreateFolderIn(0)).not.toThrow();
    expect(() => assertCanCreateFolderIn(FOLDER_MAX_DEPTH - 1)).not.toThrow();
    expect(() => assertCanCreateFolderIn(FOLDER_MAX_DEPTH)).toThrow(/Вложенность/);
  });
});

describe('assertCanMoveFolder', () => {
  it('forbids moving into itself or a descendant', () => {
    expect(() =>
      assertCanMoveFolder({ folderId: 'a', targetId: 'a', targetPathIds: ['a'], subtreeHeight: 1 }),
    ).toThrow(/саму себя/);
    expect(() =>
      assertCanMoveFolder({
        folderId: 'a',
        targetId: 'c',
        targetPathIds: ['a', 'b', 'c'],
        subtreeHeight: 3,
      }),
    ).toThrow(/саму себя/);
  });

  it('forbids exceeding the depth limit', () => {
    const deepPath = Array.from({ length: FOLDER_MAX_DEPTH - 1 }, (_, i) => `p${i}`);
    expect(() =>
      assertCanMoveFolder({
        folderId: 'a',
        targetId: deepPath.at(-1) ?? null,
        targetPathIds: deepPath,
        subtreeHeight: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertCanMoveFolder({
        folderId: 'a',
        targetId: deepPath.at(-1) ?? null,
        targetPathIds: deepPath,
        subtreeHeight: 2,
      }),
    ).toThrow(/Вложенность/);
  });

  it('allows moving to the root', () => {
    expect(() =>
      assertCanMoveFolder({ folderId: 'a', targetId: null, targetPathIds: [], subtreeHeight: 3 }),
    ).not.toThrow();
  });
});

describe('folderPath', () => {
  const folders = [
    { id: 'root', parentId: null, name: 'Проект' },
    { id: 'child', parentId: 'root', name: 'Спецификации' },
    { id: 'orphan', parentId: 'missing', name: 'Сирота' },
  ];

  it('returns the chain from the root', () => {
    expect(folderPath(folders, 'child').map((f) => f.id)).toEqual(['root', 'child']);
    expect(formatFolderPath(folderPath(folders, 'child'))).toBe('Проект / Спецификации');
  });

  it('returns empty for unknown or broken chains', () => {
    expect(folderPath(folders, 'nope')).toEqual([]);
    expect(folderPath(folders, 'orphan')).toEqual([]);
  });

  it('survives a cycle', () => {
    const cyclic = [
      { id: 'a', parentId: 'b', name: 'A' },
      { id: 'b', parentId: 'a', name: 'B' },
    ];
    expect(folderPath(cyclic, 'a')).toEqual([]);
  });
});
