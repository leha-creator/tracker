import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess, WorkspaceRole } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

const requireWorkspaceAccess =
  vi.fn<(session: AuthSession, ws: string) => Promise<WorkspaceAccess>>();
const isWorkspaceMember = vi.fn<(ws: string, userId: string) => Promise<boolean>>();
const nextNumber = vi.fn<() => Promise<number>>();
const createRow = vi.fn<
  (...args: unknown[]) => Promise<{
    id: string;
    number: number;
    title: string;
    workspace: { slug: string; name: string };
  }>
>();
const findById = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const findByNumber = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const updateRow = vi.fn<(...args: unknown[]) => Promise<number>>();
const deleteRow = vi.fn<(...args: unknown[]) => Promise<number>>();
const findStatus =
  vi.fn<
    (...args: unknown[]) => Promise<{ id: string; projectId: string; category: string } | null>
  >();
const lastPosition = vi.fn<(...args: unknown[]) => Promise<string | null>>();
const createPlacement = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const keysForTask = vi.fn<(...args: unknown[]) => Promise<string[]>>();
const deleteObjects = vi.fn<(keys: readonly string[]) => Promise<number>>();
const notify =
  vi.fn<(events: { type: string; recipientId: string; payload: object }[]) => Promise<void>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('@/modules/notifications', () => ({
  notify: (events: { type: string; recipientId: string; payload: object }[]) => notify(events),
}));
vi.mock('@/modules/workspaces', () => ({
  isWorkspaceMember: (...args: Parameters<typeof isWorkspaceMember>) => isWorkspaceMember(...args),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  parseStatusColor: (value: string) => value,
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
}));
vi.mock('../attachment/attachment.repository', () => ({
  attachmentRepository: { keysForTask: (...args: unknown[]) => keysForTask(...args) },
}));
vi.mock('@/shared/storage', () => ({
  deleteObjects: (keys: readonly string[]) => deleteObjects(keys),
}));
vi.mock('./task.repository', () => ({
  taskRepository: {
    nextNumber: () => nextNumber(),
    create: (...args: unknown[]) => createRow(...args),
    findById: (...args: unknown[]) => findById(...args),
    findByNumber: (...args: unknown[]) => findByNumber(...args),
    update: (...args: unknown[]) => updateRow(...args),
    delete: (...args: unknown[]) => deleteRow(...args),
  },
}));
vi.mock('../placement/placement.repository', () => ({
  placementRepository: {
    findStatus: (...args: unknown[]) => findStatus(...args),
    lastPosition: (...args: unknown[]) => lastPosition(...args),
    create: (...args: unknown[]) => createPlacement(...args),
  },
}));

const { createTask, deleteTask, getTaskByNumber, updateTask } = await import('./task.service');

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

const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';
const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';
const STATUS_ID = '0192f3a0-0000-7000-8000-0000000000a1';

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    number: 7,
    title: 'Задача',
    description: null,
    priority: 'none',
    dueDate: new Date('2000-01-01T00:00:00.000Z'),
    createdById: 'author',
    createdAt: new Date('2026-10-15T10:00:00.000Z'),
    updatedAt: new Date('2026-10-15T10:00:00.000Z'),
    workspace: { slug: 'team', name: 'Команда' },
    assignee: null,
    createdBy: { id: 'author', name: 'Author' },
    placements: [
      {
        projectId: PROJECT_ID,
        statusId: STATUS_ID,
        project: { name: 'Сайт' },
        status: { name: 'Готово', color: 'green', category: 'done' },
      },
    ],
    ...overrides,
  };
}

function accessAs(role: WorkspaceRole) {
  requireWorkspaceAccess.mockImplementation((_session, workspaceId) =>
    Promise.resolve({
      userId: session.user.id,
      workspaceId,
      memberId: 'm-1',
      role,
      permissions: { manageProjects: role === 'owner' },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  accessAs('member');
  isWorkspaceMember.mockResolvedValue(true);
  keysForTask.mockResolvedValue([]);
  deleteObjects.mockResolvedValue(0);
  nextNumber.mockResolvedValue(7);
  createRow.mockResolvedValue({
    id: TASK_ID,
    number: 7,
    title: 'Задача',
    workspace: { slug: 'team', name: 'Команда' },
  });
  notify.mockResolvedValue();
  findById.mockResolvedValue(taskRow());
  updateRow.mockResolvedValue(1);
  deleteRow.mockResolvedValue(1);
  findStatus.mockResolvedValue({ id: STATUS_ID, projectId: PROJECT_ID, category: 'todo' });
  lastPosition.mockResolvedValue(null);
});

describe('createTask', () => {
  it('returns NOT_FOUND for a non-member of the workspace', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError('Пространство не найдено'));
    await expect(createTask(session, { workspaceId: 'ws-1', title: 'A' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(nextNumber).not.toHaveBeenCalled();
  });

  it('rejects an assignee outside the workspace', async () => {
    isWorkspaceMember.mockResolvedValue(false);
    await expect(
      createTask(session, { workspaceId: 'ws-1', title: 'A', assigneeId: 'stranger' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: { assigneeId: expect.any(Array) },
    });
    expect(createRow).not.toHaveBeenCalled();
  });

  it('creates a task with normalized title, number and author', async () => {
    await expect(
      createTask(session, {
        workspaceId: 'ws-1',
        title: '  Новая   задача ',
        dueDate: '2026-11-01',
      }),
    ).resolves.toEqual({ taskId: TASK_ID, number: 7, workspaceSlug: 'team' });
    expect(createRow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: 'ws-1',
        number: 7,
        title: 'Новая задача',
        createdById: 'user-1',
        priority: 'none',
        dueDate: new Date('2026-11-01T00:00:00.000Z'),
      }),
    );
    expect(createPlacement).not.toHaveBeenCalled();
  });

  it('places the task at the end of the status column', async () => {
    lastPosition.mockResolvedValue('a0');
    await createTask(session, {
      workspaceId: 'ws-1',
      title: 'A',
      placement: { projectId: PROJECT_ID, statusId: STATUS_ID },
    });
    const data = createPlacement.mock.calls[0]?.[1] as { position: string; statusId: string };
    expect(data.statusId).toBe(STATUS_ID);
    expect(data.position > 'a0').toBe(true);
  });

  it('returns NOT_FOUND for a status outside the workspace', async () => {
    findStatus.mockResolvedValue(null);
    await expect(
      createTask(session, {
        workspaceId: 'ws-1',
        title: 'A',
        placement: { projectId: PROJECT_ID, statusId: STATUS_ID },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a status of another project', async () => {
    findStatus.mockResolvedValue({
      id: STATUS_ID,
      projectId: '0192f3a0-0000-7000-8000-000000000002',
      category: 'todo',
    });
    await expect(
      createTask(session, {
        workspaceId: 'ws-1',
        title: 'A',
        placement: { projectId: PROJECT_ID, statusId: STATUS_ID },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(createPlacement).not.toHaveBeenCalled();
  });
});

describe('getTaskByNumber', () => {
  it('returns NOT_FOUND for a number of another workspace', async () => {
    findByNumber.mockResolvedValue(null);
    await expect(getTaskByNumber(session, 'ws-1', 7)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('maps the task: key, date, done task is not overdue, delete permission', async () => {
    findByNumber.mockResolvedValue(taskRow());
    const task = await getTaskByNumber(session, 'ws-1', 7);
    expect(task).toMatchObject({
      key: '#7',
      dueDate: '2000-01-01',
      isOverdue: false,
      canDelete: false,
      placements: [{ projectName: 'Сайт', statusCategory: 'done' }],
    });
  });

  it('marks an unfinished task with a past due date as overdue', async () => {
    findByNumber.mockResolvedValue(taskRow({ placements: [], createdById: 'user-1' }));
    await expect(getTaskByNumber(session, 'ws-1', 7)).resolves.toMatchObject({
      isOverdue: true,
      canDelete: true,
    });
  });
});

describe('updateTask', () => {
  it('returns NOT_FOUND for a task of another workspace', async () => {
    findById.mockResolvedValue(null);
    await expect(
      updateTask(session, { workspaceId: 'ws-1', taskId: TASK_ID, title: 'B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(updateRow).not.toHaveBeenCalled();
  });

  it('rejects a malformed task id without a query', async () => {
    await expect(
      updateTask(session, { workspaceId: 'ws-1', taskId: 'abc', title: 'B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findById).not.toHaveBeenCalled();
  });

  it('updates only provided fields and clears with null', async () => {
    await updateTask(session, {
      workspaceId: 'ws-1',
      taskId: TASK_ID,
      dueDate: null,
      assigneeId: null,
    });
    expect(updateRow).toHaveBeenCalledWith('ws-1', TASK_ID, { dueDate: null, assigneeId: null });
    expect(isWorkspaceMember).not.toHaveBeenCalled();
  });

  it('checks a newly assigned user', async () => {
    isWorkspaceMember.mockResolvedValue(false);
    await expect(
      updateTask(session, { workspaceId: 'ws-1', taskId: TASK_ID, assigneeId: 'stranger' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(updateRow).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies a newly assigned user', async () => {
    await updateTask(session, { workspaceId: 'ws-1', taskId: TASK_ID, assigneeId: 'user-2' });
    expect(notify).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'task_assigned',
        recipientId: 'user-2',
        actorId: 'user-1',
        payload: expect.objectContaining({ taskNumber: 7, workspaceSlug: 'team' }),
      }),
    ]);
  });

  it('does not notify when the assignee is unchanged or cleared', async () => {
    findById.mockResolvedValue(taskRow({ assignee: { id: 'user-2', name: 'B', image: null } }));
    await updateTask(session, { workspaceId: 'ws-1', taskId: TASK_ID, assigneeId: 'user-2' });
    await updateTask(session, { workspaceId: 'ws-1', taskId: TASK_ID, assigneeId: null });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('createTask notifications', () => {
  it('notifies the assignee of a new task', async () => {
    await createTask(session, { workspaceId: 'ws-1', title: 'Новая', assigneeId: 'user-2' });
    expect(notify).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'task_assigned', recipientId: 'user-2' }),
    ]);
  });

  it('does not notify without an assignee', async () => {
    await createTask(session, { workspaceId: 'ws-1', title: 'Новая' });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('deleteTask', () => {
  it('forbids a member to delete a task of another author', async () => {
    await expect(
      deleteTask(session, { workspaceId: 'ws-1', taskId: TASK_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('lets the workspace owner delete any task', async () => {
    accessAs('owner');
    await expect(deleteTask(session, { workspaceId: 'ws-1', taskId: TASK_ID })).resolves.toEqual({
      workspaceSlug: 'team',
    });
    expect(deleteRow).toHaveBeenCalledWith('ws-1', TASK_ID);
  });

  it('removes stored objects of task files; storage failure does not break deletion', async () => {
    accessAs('owner');
    keysForTask.mockResolvedValue(['ws/a']);
    deleteObjects.mockResolvedValue(1);
    await expect(deleteTask(session, { workspaceId: 'ws-1', taskId: TASK_ID })).resolves.toEqual({
      workspaceSlug: 'team',
    });
    expect(deleteObjects).toHaveBeenCalledWith(['ws/a']);
  });
});
