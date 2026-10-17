import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';

import { SAVED_VIEWS_PER_SCOPE } from '../../models';

type Target = { scope: string; workspaceId: string | null; projectId: string | null };
type ViewRow = { id: string; name: string; params: string };

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const getProject = vi.fn<(s: AuthSession, ws: string, id: string) => Promise<unknown>>();
const list = vi.fn<(userId: string, target: Target) => Promise<ViewRow[]>>();
const count = vi.fn<() => Promise<number>>();
const isNameTaken = vi.fn<() => Promise<boolean>>();
const createRow = vi.fn<(data: Target & { name: string; params: string }) => Promise<ViewRow>>();
const findOwn = vi.fn<() => Promise<(ViewRow & Target) | null>>();
const renameRow = vi.fn<() => Promise<boolean>>();
const deleteRow = vi.fn<() => Promise<boolean>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/modules/projects', () => ({
  getProject: (s: AuthSession, ws: string, id: string) => getProject(s, ws, id),
}));
vi.mock('@/shared/db', () => ({ isUniqueViolation: () => false }));
vi.mock('./saved-view.repository', () => ({
  savedViewRepository: {
    list: (userId: string, target: Target) => list(userId, target),
    count: () => count(),
    isNameTaken: () => isNameTaken(),
    create: (data: Target & { name: string; params: string }) => createRow(data),
    findOwn: () => findOwn(),
    rename: () => renameRow(),
    delete: () => deleteRow(),
  },
}));

const { createSavedView, deleteSavedView, listSavedViews, renameSavedView } =
  await import('./saved-view.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    image: null,
    role: 'user',
    banned: false,
    isAgent: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';
const VIEW_ID = '0192f3a0-0000-7000-8000-0000000000aa';

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'ws-1',
    memberId: 'm-1',
    role: 'member',
  } as WorkspaceAccess);
  getProject.mockResolvedValue({ id: PROJECT_ID });
  count.mockResolvedValue(0);
  isNameTaken.mockResolvedValue(false);
  createRow.mockImplementation((data) =>
    Promise.resolve({ id: VIEW_ID, name: data.name, params: data.params }),
  );
});

describe('createSavedView', () => {
  it('stores canonical params in the workspace scope', async () => {
    const view = await createSavedView(session, {
      scope: 'workspace',
      workspaceId: 'ws-1',
      name: ' Срочные ',
      params: 'page=2&priority=urgent',
    });
    expect(view).toEqual({ id: VIEW_ID, name: 'Срочные', params: 'priority=urgent' });
    expect(createRow).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'workspace', workspaceId: 'ws-1', projectId: null }),
    );
  });

  it('«Мои задачи» need no workspace access', async () => {
    await createSavedView(session, { scope: 'mine', name: 'На неделю', params: 'due=week' });
    expect(requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(createRow).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'mine', workspaceId: null, projectId: null }),
    );
  });

  it('rejects over the limit', async () => {
    count.mockResolvedValue(SAVED_VIEWS_PER_SCOPE);
    await expect(
      createSavedView(session, { scope: 'mine', name: 'Ещё', params: '' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createRow).not.toHaveBeenCalled();
  });

  it('a duplicate name is a field error', async () => {
    isNameTaken.mockResolvedValue(true);
    const error = await createSavedView(session, {
      scope: 'mine',
      name: 'Дубль',
      params: '',
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors?.name).toBeDefined();
  });

  it('a project from another workspace is not found', async () => {
    getProject.mockRejectedValue(new NotFoundError('Проект не найден'));
    await expect(
      createSavedView(session, {
        scope: 'project',
        workspaceId: 'ws-1',
        projectId: PROJECT_ID,
        name: 'Мой',
        params: '',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(createRow).not.toHaveBeenCalled();
  });

  it('a non-member cannot save in the workspace', async () => {
    requireWorkspaceAccess.mockRejectedValue(new ForbiddenError());
    await expect(
      createSavedView(session, { scope: 'workspace', workspaceId: 'ws-2', name: 'X', params: '' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('listSavedViews', () => {
  it('lists only my views of the project scope', async () => {
    list.mockResolvedValue([]);
    await listSavedViews(session, { scope: 'project', workspaceId: 'ws-1', projectId: PROJECT_ID });
    expect(list).toHaveBeenCalledWith('user-1', {
      scope: 'project',
      workspaceId: 'ws-1',
      projectId: PROJECT_ID,
    });
  });
});

describe('rename and delete', () => {
  it('someone else’s view is not found', async () => {
    findOwn.mockResolvedValue(null);
    await expect(
      renameSavedView(session, { viewId: VIEW_ID, name: 'Новое' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    deleteRow.mockResolvedValue(false);
    await expect(deleteSavedView(session, { viewId: VIEW_ID })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('renames my view', async () => {
    findOwn.mockResolvedValue({
      id: VIEW_ID,
      name: 'Старое',
      params: '',
      scope: 'mine',
      workspaceId: null,
      projectId: null,
    });
    renameRow.mockResolvedValue(true);
    await renameSavedView(session, { viewId: VIEW_ID, name: 'Новое' });
    expect(renameRow).toHaveBeenCalled();
  });
});
