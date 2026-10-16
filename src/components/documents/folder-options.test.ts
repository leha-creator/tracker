import { describe, expect, it } from 'vitest';

import { folderOptions } from './folder-options';

const folders = [
  { id: 'b', parentId: null, name: 'Бюджет', documentsCount: 0 },
  { id: 'a', parentId: null, name: 'Архив', documentsCount: 0 },
  { id: 'a1', parentId: 'a', name: '2025', documentsCount: 0 },
];

describe('folderOptions', () => {
  it('lists the root and the tree in order with depth', () => {
    expect(folderOptions(folders).map((o) => [o.value, o.depth, o.disabled])).toEqual([
      ['root', 0, false],
      ['a', 1, false],
      ['a1', 2, false],
      ['b', 1, false],
    ]);
  });

  it('disables the moved folder and its subtree', () => {
    expect(
      folderOptions(folders, 'a')
        .filter((o) => o.disabled)
        .map((o) => o.value),
    ).toEqual(['a', 'a1']);
  });
});
