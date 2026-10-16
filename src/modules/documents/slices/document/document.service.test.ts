import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { WorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

import { NOTE_CONTENT_MAX_LENGTH } from '../../models';
import type { DocumentRow } from './document.select';

const WS = 'ws-1';
const DOC = '0199f3a4-1b2c-7d3e-8f40-0000000000d1';
const FOLDER = '0199f3a4-1b2c-7d3e-8f40-0000000000f1';

const requireWorkspacePermission = vi.fn<(...args: unknown[]) => Promise<WorkspaceAccess>>();
const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const findVisible = vi.fn<(ws: string, id: string) => Promise<DocumentRow | null>>();
const createNoteRepo = vi.fn<(data: Record<string, unknown>) => Promise<DocumentRow>>();
const updateNoteRepo = vi.fn<(...args: unknown[]) => Promise<number>>();
const updateRepo = vi.fn<(...args: unknown[]) => Promise<number>>();
const findVersion = vi.fn<() => Promise<{ version: number; updatedAt: Date } | null>>();
const deleteRepo = vi.fn<() => Promise<number>>();
const loadFolder = vi.fn<(ws: string, id: string) => Promise<unknown>>();
const deleteObjects = vi.fn<(keys: readonly string[]) => Promise<number>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
  requireWorkspacePermission: (...args: unknown[]) => requireWorkspacePermission(...args),
}));
vi.mock('@/shared/storage', () => ({
  deleteObjects: (keys: readonly string[]) => deleteObjects(keys),
}));
vi.mock('../folder/folder.service', () => ({
  loadFolder: (ws: string, id: string) => loadFolder(ws, id),
}));
vi.mock('./document.repository', () => ({
  documentRepository: {
    findVisible: (ws: string, id: string) => findVisible(ws, id),
    createNote: (data: Record<string, unknown>) => createNoteRepo(data),
    updateNote: (...args: unknown[]) => updateNoteRepo(...args),
    update: (...args: unknown[]) => updateRepo(...args),
    findVersion: () => findVersion(),
    delete: () => deleteRepo(),
  },
}));

const { createNote, deleteDocument, getDocument, moveDocument, renameDocument, updateNote } =
  await import('./document.service');

const session = { user: { id: 'user-1' } } as AuthSession;
const access = {
  userId: 'user-1',
  workspaceId: WS,
  memberId: 'm-1',
  role: 'member',
  permissions: { manageProjects: false, manageDocuments: true },
} satisfies WorkspaceAccess;

function noteRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: DOC,
    workspaceId: WS,
    folderId: null,
    kind: 'note',
    title: 'Регламент',
    extension: null,
    contentType: null,
    size: null,
    status: null,
    createdAt: new Date('2026-10-16T10:00:00Z'),
    updatedAt: new Date('2026-10-16T11:00:00Z'),
    createdBy: { id: 'user-1', name: 'Анна', image: null },
    updatedBy: null,
    tags: [
      { tag: { id: 't2', name: 'Релизы', nameKey: 'релизы', color: 'blue' } },
      { tag: { id: 't1', name: 'Архитектура', nameKey: 'архитектура', color: 'pink' } },
    ],
    content: '# Привет',
    version: 3,
    fileName: null,
    storageKey: null,
    workspace: { slug: 'team' },
    ...overrides,
  };
}

const fileRow = () =>
  noteRow({
    kind: 'file',
    title: 'Схема',
    extension: 'png',
    contentType: 'image/png',
    size: 1024,
    status: 'ready',
    content: null,
    fileName: 'Схема.png',
    storageKey: `ws/${WS}/docs/${DOC}`,
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspacePermission.mockResolvedValue(access);
  requireWorkspaceAccess.mockResolvedValue(access);
  updateRepo.mockResolvedValue(1);
  deleteRepo.mockResolvedValue(1);
  deleteObjects.mockResolvedValue(0);
  loadFolder.mockResolvedValue({ id: FOLDER });
});

describe('getDocument', () => {
  it('maps a note with sorted tags and unknown colors replaced', async () => {
    findVisible.mockResolvedValue(noteRow());
    const doc = await getDocument(session, WS, DOC);
    expect(doc).toMatchObject({
      kind: 'note',
      content: '# Привет',
      version: 3,
      workspaceSlug: 'team',
      fileKind: null,
      viewer: null,
      inlineViewable: false,
      createdBy: { userId: 'user-1', name: 'Анна', image: null },
    });
    expect(doc.tags).toEqual([
      { id: 't1', name: 'Архитектура', color: 'gray' },
      { id: 't2', name: 'Релизы', color: 'blue' },
    ]);
  });

  it('maps a file with its viewer', async () => {
    findVisible.mockResolvedValue(fileRow());
    await expect(getDocument(session, WS, DOC)).resolves.toMatchObject({
      kind: 'file',
      content: null,
      fileKind: 'image',
      viewer: 'image',
      inlineViewable: true,
    });
  });

  it('returns NOT_FOUND for another workspace or a malformed id', async () => {
    findVisible.mockResolvedValue(null);
    await expect(getDocument(session, WS, DOC)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getDocument(session, WS, 'x')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('createNote', () => {
  it('requires manageDocuments', async () => {
    requireWorkspacePermission.mockRejectedValue(new ForbiddenError());
    await expect(
      createNote(session, { workspaceId: WS, folderId: null, title: 'A', content: '' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(requireWorkspacePermission).toHaveBeenCalledWith(session, WS, 'manageDocuments');
    expect(createNoteRepo).not.toHaveBeenCalled();
  });

  it('normalizes title and line endings and checks the folder', async () => {
    createNoteRepo.mockResolvedValue(noteRow({ folderId: FOLDER }));
    await createNote(session, {
      workspaceId: WS,
      folderId: FOLDER,
      title: '  План   релиза ',
      content: 'a\r\nb',
    });
    expect(loadFolder).toHaveBeenCalledWith(WS, FOLDER);
    expect(createNoteRepo).toHaveBeenCalledWith({
      workspaceId: WS,
      folderId: FOLDER,
      title: 'План релиза',
      titleKey: 'план релиза',
      content: 'a\nb',
      userId: 'user-1',
    });
  });

  it('rejects a folder of another workspace', async () => {
    loadFolder.mockRejectedValue(new NotFoundError('Папка не найдена'));
    await expect(
      createNote(session, { workspaceId: WS, folderId: FOLDER, title: 'A', content: '' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(createNoteRepo).not.toHaveBeenCalled();
  });

  it('rejects too long content', async () => {
    await expect(
      createNote(session, {
        workspaceId: WS,
        folderId: null,
        title: 'A',
        content: 'x'.repeat(NOTE_CONTENT_MAX_LENGTH + 1),
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: { content: expect.any(Array) },
    });
  });
});

describe('updateNote', () => {
  const input = { workspaceId: WS, documentId: DOC, title: 'Новое', content: 'текст', version: 3 };

  it('saves with the expected version and returns the new one', async () => {
    findVisible.mockResolvedValue(noteRow());
    updateNoteRepo.mockResolvedValue(1);
    findVersion.mockResolvedValue({ version: 4, updatedAt: new Date('2026-10-16T12:00:00Z') });
    await expect(updateNote(session, input)).resolves.toEqual({
      version: 4,
      updatedAt: new Date('2026-10-16T12:00:00Z'),
    });
    expect(updateNoteRepo).toHaveBeenCalledWith(WS, DOC, 3, {
      title: 'Новое',
      titleKey: 'новое',
      content: 'текст',
      userId: 'user-1',
    });
  });

  it('reports CONFLICT when the stored version is newer', async () => {
    findVisible.mockResolvedValue(noteRow({ version: 5 }));
    await expect(updateNote(session, input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(updateNoteRepo).not.toHaveBeenCalled();
  });

  it('reports CONFLICT on a concurrent save between read and write', async () => {
    findVisible.mockResolvedValue(noteRow());
    updateNoteRepo.mockResolvedValue(0);
    await expect(updateNote(session, input)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to edit a file', async () => {
    findVisible.mockResolvedValue(fileRow());
    await expect(updateNote(session, input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('renameDocument', () => {
  it('renames a file keeping its extension in the download name', async () => {
    findVisible.mockResolvedValue(fileRow());
    await renameDocument(session, { workspaceId: WS, documentId: DOC, title: 'Схема БД' });
    expect(updateRepo).toHaveBeenCalledWith(WS, DOC, {
      title: 'Схема БД',
      titleKey: 'схема бд',
      fileName: 'Схема БД.png',
      updatedById: 'user-1',
    });
  });

  it('renames a note without a file name', async () => {
    findVisible.mockResolvedValue(noteRow());
    await renameDocument(session, { workspaceId: WS, documentId: DOC, title: 'X' });
    expect(updateRepo).toHaveBeenCalledWith(
      WS,
      DOC,
      expect.objectContaining({ fileName: undefined }),
    );
  });
});

describe('moveDocument', () => {
  it('moves into a folder of the same workspace', async () => {
    findVisible.mockResolvedValue(noteRow());
    await moveDocument(session, { workspaceId: WS, documentId: DOC, folderId: FOLDER });
    expect(loadFolder).toHaveBeenCalledWith(WS, FOLDER);
    expect(updateRepo).toHaveBeenCalledWith(WS, DOC, { folderId: FOLDER, updatedById: 'user-1' });
  });

  it('skips moving into the current folder', async () => {
    findVisible.mockResolvedValue(noteRow({ folderId: FOLDER }));
    await moveDocument(session, { workspaceId: WS, documentId: DOC, folderId: FOLDER });
    expect(updateRepo).not.toHaveBeenCalled();
  });
});

describe('deleteDocument', () => {
  it('deletes the row and then the file object', async () => {
    findVisible.mockResolvedValue(fileRow());
    await expect(deleteDocument(session, { workspaceId: WS, documentId: DOC })).resolves.toEqual({
      folderId: null,
    });
    expect(deleteObjects).toHaveBeenCalledWith([`ws/${WS}/docs/${DOC}`]);
  });

  it('does not touch storage for a note and survives storage failures for files', async () => {
    findVisible.mockResolvedValue(noteRow());
    await deleteDocument(session, { workspaceId: WS, documentId: DOC });
    expect(deleteObjects).not.toHaveBeenCalled();

    findVisible.mockResolvedValue(fileRow());
    deleteObjects.mockResolvedValue(1);
    await expect(deleteDocument(session, { workspaceId: WS, documentId: DOC })).resolves.toEqual({
      folderId: null,
    });
  });
});
