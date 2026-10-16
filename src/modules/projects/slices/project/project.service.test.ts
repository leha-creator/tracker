import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { WorkspaceAccess, WorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

import { PROJECT_LIMIT } from '../../models';

const requireWorkspacePermission =
  vi.fn<
    (
      session: AuthSession,
      workspaceId: string,
      permission: WorkspacePermission,
    ) => Promise<WorkspaceAccess>
  >();
const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
type ProjectRow = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  workspace: { slug: string };
  _count: { placements: number };
};
const findInWorkspace = vi.fn<(...args: unknown[]) => Promise<ProjectRow | null>>();
const countInWorkspace = vi.fn<() => Promise<number>>();
const isNameTaken = vi.fn<() => Promise<boolean>>();
const createWithStatuses = vi.fn<(...args: unknown[]) => Promise<ProjectRow>>();
const deleteProject = vi.fn<() => Promise<number>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
  requireWorkspacePermission: (...args: Parameters<typeof requireWorkspacePermission>) =>
    requireWorkspacePermission(...args),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
  isUniqueViolation: (error: { code?: string }) => error?.code === 'P2002',
}));
vi.mock('./project.repository', () => ({
  projectRepository: {
    findInWorkspace: (...args: unknown[]) => findInWorkspace(...args),
    countInWorkspace: () => countInWorkspace(),
    isNameTaken: () => isNameTaken(),
    createWithStatuses: (...args: unknown[]) => createWithStatuses(...args),
    delete: () => deleteProject(),
    listByWorkspace: vi.fn(),
    update: vi.fn(),
  },
}));

const {
  createProject,
  deleteProject: deleteProjectService,
  getProject,
} = await import('./project.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    image: null,
    role: 'user',
    banned: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';
const projectRow: ProjectRow = {
  id: PROJECT_ID,
  workspaceId: 'ws-1',
  name: 'Сайт',
  description: null,
  createdAt: new Date('2026-10-15'),
  workspace: { slug: 'team' },
  _count: { placements: 0 },
};

function allow() {
  requireWorkspacePermission.mockImplementation((_s, workspaceId) =>
    Promise.resolve({
      userId: session.user.id,
      workspaceId,
      memberId: 'm-1',
      role: 'member',
      permissions: { manageProjects: true, manageDocuments: true },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isNameTaken.mockResolvedValue(false);
  requireWorkspaceAccess.mockResolvedValue({
    userId: session.user.id,
    workspaceId: 'ws-1',
    memberId: 'm-1',
    role: 'member',
    permissions: { manageProjects: false, manageDocuments: false },
  });
});

describe('createProject', () => {
  it('is forbidden without manageProjects', async () => {
    requireWorkspacePermission.mockRejectedValue(new ForbiddenError());
    await expect(
      createProject(session, { workspaceId: 'ws-1', name: 'Сайт' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(createWithStatuses).not.toHaveBeenCalled();
  });

  it('creates the project with three default statuses', async () => {
    allow();
    countInWorkspace.mockResolvedValue(0);
    createWithStatuses.mockResolvedValue(projectRow);

    const project = await createProject(session, { workspaceId: 'ws-1', name: '  Сайт ' });

    expect(requireWorkspacePermission).toHaveBeenCalledWith(session, 'ws-1', 'manageProjects');
    const [, data, statuses] = createWithStatuses.mock.calls[0] as [
      unknown,
      { name: string; createdById: string },
      { category: string; position: number }[],
    ];
    expect(data).toMatchObject({ name: 'Сайт', createdById: 'user-1', description: null });
    expect(statuses.map((s) => [s.category, s.position])).toEqual([
      ['todo', 0],
      ['in_progress', 1],
      ['done', 2],
    ]);
    expect(project).toMatchObject({ id: PROJECT_ID, workspaceSlug: 'team' });
  });

  it('rejects creation over the limit', async () => {
    allow();
    countInWorkspace.mockResolvedValue(PROJECT_LIMIT);
    await expect(
      createProject(session, { workspaceId: 'ws-1', name: 'Сайт' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(createWithStatuses).not.toHaveBeenCalled();
  });

  it('rejects a taken name before insert', async () => {
    allow();
    countInWorkspace.mockResolvedValue(1);
    isNameTaken.mockResolvedValue(true);
    await expect(
      createProject(session, { workspaceId: 'ws-1', name: 'Сайт' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', fieldErrors: { name: expect.any(Array) } });
    expect(createWithStatuses).not.toHaveBeenCalled();
  });

  it('maps unique violation (race) to CONFLICT on name', async () => {
    allow();
    countInWorkspace.mockResolvedValue(1);
    createWithStatuses.mockRejectedValue({ code: 'P2002' });
    await expect(
      createProject(session, { workspaceId: 'ws-1', name: 'Сайт' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', fieldErrors: { name: expect.any(Array) } });
  });
});

describe('getProject', () => {
  it('returns NOT_FOUND for a project of another workspace', async () => {
    findInWorkspace.mockResolvedValue(null);
    await expect(getProject(session, 'ws-1', PROJECT_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(findInWorkspace).toHaveBeenCalledWith('ws-1', PROJECT_ID);
  });

  it('returns NOT_FOUND for a malformed id without querying', async () => {
    await expect(getProject(session, 'ws-1', 'not-a-uuid')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(findInWorkspace).not.toHaveBeenCalled();
  });
});

describe('deleteProject', () => {
  it('rejects wrong confirmation name', async () => {
    allow();
    findInWorkspace.mockResolvedValue(projectRow);
    await expect(
      deleteProjectService(session, {
        workspaceId: 'ws-1',
        projectId: PROJECT_ID,
        confirmName: 'x',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('deletes and returns workspace slug', async () => {
    allow();
    findInWorkspace.mockResolvedValue(projectRow);
    deleteProject.mockResolvedValue(1);
    await expect(
      deleteProjectService(session, {
        workspaceId: 'ws-1',
        projectId: PROJECT_ID,
        confirmName: 'Сайт',
      }),
    ).resolves.toEqual({ workspaceSlug: 'team' });
  });
});
