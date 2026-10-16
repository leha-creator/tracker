import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';

import { defaultDocumentListQuery, DOCUMENT_LIST_PAGE_SIZE } from '../../models';

const WS = 'ws-1';
const ROOT = '0199f3a4-1b2c-7d3e-8f40-0000000000f1';
const CHILD = '0199f3a4-1b2c-7d3e-8f40-0000000000f2';

const listFolderTree = vi.fn<() => Promise<unknown[]>>();
const getFolderPaths = vi.fn<() => Promise<Map<string, string>>>();
const listDocumentPage =
  vi.fn<(args: { skip: number }) => Promise<{ rows: unknown[]; total: number }>>();

vi.mock('@/shared/access', () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock('../file/file.service', () => ({ getWorkspaceStorageUsage: vi.fn() }));
vi.mock('../folder/folder.service', () => ({
  listFolderTree: () => listFolderTree(),
  getFolderPaths: () => getFolderPaths(),
  folderNotFound: () => Object.assign(new Error('Папка не найдена'), { code: 'NOT_FOUND' }),
}));
vi.mock('./views.repository', () => ({
  viewsRepository: {
    listDocumentPage: (args: { skip: number }) => listDocumentPage(args),
    listRecent: vi.fn(),
  },
}));

const { listDocuments } = await import('./views.queries');

const session = { user: { id: 'user-1' } } as AuthSession;
const tree = [
  { id: ROOT, parentId: null, name: 'Проект', documentsCount: 1 },
  { id: CHILD, parentId: ROOT, name: 'Схемы', documentsCount: 0 },
  { id: 'f3', parentId: ROOT, name: 'Архив', documentsCount: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  listFolderTree.mockResolvedValue(tree);
  getFolderPaths.mockResolvedValue(new Map());
  listDocumentPage.mockResolvedValue({ rows: [], total: 0 });
});

describe('listDocuments', () => {
  it('shows sorted subfolders and the breadcrumb path of the current folder', async () => {
    const page = await listDocuments(session, WS, { ...defaultDocumentListQuery(), folder: ROOT });
    expect(page.path).toEqual([{ id: ROOT, name: 'Проект' }]);
    expect(page.folders.map((folder) => folder.name)).toEqual(['Архив', 'Схемы']);
    expect(page.isSearch).toBe(false);
  });

  it('hides folders in search mode', async () => {
    const page = await listDocuments(session, WS, { ...defaultDocumentListQuery(), q: 'план' });
    expect(page.folders).toEqual([]);
    expect(page.isSearch).toBe(true);
  });

  it('returns NOT_FOUND for an unknown folder', async () => {
    await expect(
      listDocuments(session, WS, {
        ...defaultDocumentListQuery(),
        folder: '0199f3a4-1b2c-7d3e-8f40-0000000000ff',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('clamps a page beyond the end to the last one', async () => {
    listDocumentPage.mockResolvedValue({ rows: [], total: DOCUMENT_LIST_PAGE_SIZE + 1 });
    const page = await listDocuments(session, WS, { ...defaultDocumentListQuery(), page: 9 });
    expect(page.page).toBe(2);
    expect(listDocumentPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: DOCUMENT_LIST_PAGE_SIZE }),
    );
    expect(page.folders).toEqual([]);
  });
});
