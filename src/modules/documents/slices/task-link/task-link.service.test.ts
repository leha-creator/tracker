import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { WorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

import { TASK_DOCUMENT_LINKS_LIMIT } from '../../models';

const WS = 'ws-1';
const TASK = '0199f3a4-1b2c-7d3e-8f40-0000000000e1';
const DOC = '0199f3a4-1b2c-7d3e-8f40-0000000000d1';
const FOLDER = '0199f3a4-1b2c-7d3e-8f40-0000000000f1';

const requireWorkspaceAccess = vi.fn<(...args: unknown[]) => Promise<WorkspaceAccess>>();
const getTaskSummaries = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const listTasks = vi.fn<(...args: unknown[]) => Promise<{ items: unknown[] }>>();
const loadDocument = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getFolderPaths = vi.fn<() => Promise<Map<string, string>>>();
const repo = {
  listDocumentsForTask: vi.fn<() => Promise<unknown[]>>(),
  listTaskIdsForDocument: vi.fn<() => Promise<string[]>>(),
  countForTask: vi.fn<() => Promise<number>>(),
  exists: vi.fn<() => Promise<boolean>>(),
  create: vi.fn<(data: Record<string, unknown>) => Promise<number>>(),
  delete: vi.fn<() => Promise<number>>(),
  searchDocuments: vi.fn<(input: Record<string, unknown>) => Promise<unknown[]>>(),
};

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: unknown[]) => requireWorkspaceAccess(...args),
}));
vi.mock('@/modules/tasks', () => ({
  getTaskSummaries: (...args: unknown[]) => getTaskSummaries(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
  parseTaskListParams: (raw: { q: string }) => ({ q: raw.q }),
}));
vi.mock('../document/document.service', () => ({
  loadDocument: (...args: unknown[]) => loadDocument(...args),
}));
vi.mock('../folder/folder.service', () => ({ getFolderPaths: () => getFolderPaths() }));
vi.mock('./task-link.repository', () => ({ taskLinkRepository: repo }));

const {
  linkDocumentToTask,
  listDocumentTasks,
  listTaskDocuments,
  searchDocumentsForLink,
  searchTasksForLink,
  unlinkDocumentFromTask,
} = await import('./task-link.service');

const session = { user: { id: 'user-1' } } as AuthSession;
const access = {
  userId: 'user-1',
  workspaceId: WS,
  memberId: 'm-1',
  role: 'member',
  permissions: { manageProjects: false, manageDocuments: false },
} satisfies WorkspaceAccess;
const input = { workspaceId: WS, taskId: TASK, documentId: DOC };
const summary = { id: TASK, number: 42, key: '#42', title: 'Задача', isDone: false };

const docRow = {
  id: DOC,
  workspaceId: WS,
  folderId: FOLDER,
  kind: 'note',
  title: 'Регламент',
  extension: null,
  contentType: null,
  size: null,
  status: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  updatedBy: null,
  tags: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue(access);
  loadDocument.mockResolvedValue({ id: DOC });
  getTaskSummaries.mockResolvedValue([summary]);
  getFolderPaths.mockResolvedValue(new Map([[FOLDER, 'Проект / Регламенты']]));
  repo.exists.mockResolvedValue(false);
  repo.countForTask.mockResolvedValue(0);
  repo.create.mockResolvedValue(1);
  repo.delete.mockResolvedValue(1);
});

describe('linkDocumentToTask', () => {
  it('lets any member link a document of the workspace', async () => {
    await linkDocumentToTask(session, input);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(session, WS);
    expect(repo.create).toHaveBeenCalledWith({ ...input, createdById: 'user-1' });
  });

  it('refuses a document or a task of another workspace', async () => {
    loadDocument.mockRejectedValue(new NotFoundError('Документ не найден'));
    await expect(linkDocumentToTask(session, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    loadDocument.mockResolvedValue({ id: DOC });
    getTaskSummaries.mockResolvedValue([]);
    await expect(linkDocumentToTask(session, input)).rejects.toThrow(/Задача не найдена/);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('is idempotent and does not count an existing link against the limit', async () => {
    repo.exists.mockResolvedValue(true);
    repo.countForTask.mockResolvedValue(TASK_DOCUMENT_LINKS_LIMIT);
    await linkDocumentToTask(session, input);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('enforces the limit for a new link', async () => {
    repo.countForTask.mockResolvedValue(TASK_DOCUMENT_LINKS_LIMIT);
    await expect(linkDocumentToTask(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('unlinkDocumentFromTask', () => {
  it('succeeds even when there is no link', async () => {
    repo.delete.mockResolvedValue(0);
    await expect(unlinkDocumentFromTask(session, input)).resolves.toBeUndefined();
  });
});

describe('listing', () => {
  it('adds folder paths to task documents', async () => {
    repo.listDocumentsForTask.mockResolvedValue([docRow, { ...docRow, id: 'd2', folderId: null }]);
    const docs = await listTaskDocuments(session, WS, TASK);
    expect(docs.map((doc) => doc.folderPath)).toEqual(['Проект / Регламенты', '']);
  });

  it('returns NOT_FOUND for a malformed task id', async () => {
    await expect(listTaskDocuments(session, WS, 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists tasks of a document through the tasks module', async () => {
    repo.listTaskIdsForDocument.mockResolvedValue([TASK]);
    await expect(listDocumentTasks(session, WS, DOC)).resolves.toEqual([summary]);
    expect(getTaskSummaries).toHaveBeenCalledWith(session, WS, [TASK]);
  });
});

describe('search for linking', () => {
  it('searches documents excluding those already linked to the task', async () => {
    repo.searchDocuments.mockResolvedValue([docRow]);
    await searchDocumentsForLink(session, { workspaceId: WS, q: 'рег', taskId: TASK });
    expect(repo.searchDocuments).toHaveBeenCalledWith({
      workspaceId: WS,
      q: 'рег',
      excludeTaskId: TASK,
      take: 20,
    });
  });

  it('searches tasks excluding those already linked to the document', async () => {
    repo.listTaskIdsForDocument.mockResolvedValue([TASK]);
    listTasks.mockResolvedValue({
      items: [
        { id: TASK, number: 42, key: '#42', title: 'Уже', placements: [] },
        {
          id: 't2',
          number: 7,
          key: '#7',
          title: 'Готова',
          placements: [{ statusCategory: 'done' }],
        },
      ],
    });
    await expect(
      searchTasksForLink(session, { workspaceId: WS, q: '#7', documentId: DOC }),
    ).resolves.toEqual([{ id: 't2', number: 7, key: '#7', title: 'Готова', isDone: true }]);
    expect(listTasks).toHaveBeenCalledWith(session, WS, { q: '#7' });
  });
});
