import { describe, expect, it } from 'vitest';

import { createFolderSchema, moveFolderSchema } from './folder.schema';

const ID = '0199f3a4-1b2c-7d3e-8f40-000000000001';

describe('folder schemas', () => {
  it('treats an empty or "root" parent as the workspace root', () => {
    expect(createFolderSchema.parse({ workspaceId: 'ws', name: 'A', parentId: '' }).parentId).toBe(
      null,
    );
    expect(createFolderSchema.parse({ workspaceId: 'ws', name: 'A' }).parentId).toBe(null);
    expect(
      moveFolderSchema.parse({ workspaceId: 'ws', folderId: ID, targetId: 'root' }).targetId,
    ).toBe(null);
  });

  it('keeps a valid parent id and rejects garbage', () => {
    expect(createFolderSchema.parse({ workspaceId: 'ws', name: 'A', parentId: ID }).parentId).toBe(
      ID,
    );
    expect(() =>
      createFolderSchema.parse({ workspaceId: 'ws', name: 'A', parentId: '../x' }),
    ).toThrow();
  });
});
