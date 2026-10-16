import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as GithubModule from '@/modules/integrations/github';
import type * as ProjectsModule from '@/modules/projects';
import type * as TasksModule from '@/modules/tasks';
import type { TaskDto, TaskListQuery } from '@/modules/tasks';
import type * as WorkspacesModule from '@/modules/workspaces';
import { ForbiddenError, ValidationError } from '@/shared/errors';

import type { McpContext } from '../context';
import { runTool } from '../tool-result';

const listTasks = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const listProjectTasks = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getTaskByNumber = vi.fn<(session: unknown, ws: string, n: number) => Promise<TaskDto>>();
const createTask = vi.fn<(...args: unknown[]) => Promise<{ taskId: string; number: number }>>();
const updateTask = vi.fn<(...args: unknown[]) => Promise<void>>();
const addToProject = vi.fn<(...args: unknown[]) => Promise<void>>();
const changeStatus = vi.fn<(...args: unknown[]) => Promise<void>>();
const setTaskParent = vi.fn<(...args: unknown[]) => Promise<void>>();
const createComment = vi.fn<(...args: unknown[]) => Promise<{ commentId: string }>>();
const resolveTaskRefs = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const getSummary = vi.fn<(...args: unknown[]) => Promise<unknown>>();

const P_DEV = '0199e5a0-0000-7000-8000-000000000001';
const P_OPS = '0199e5a0-0000-7000-8000-000000000002';
const S_TODO = '0199e5a0-0000-7000-8000-000000000011';
const S_WORK = '0199e5a0-0000-7000-8000-000000000012';
const S_DONE = '0199e5a0-0000-7000-8000-000000000013';
const S_OPS = '0199e5a0-0000-7000-8000-000000000021';

const EMPTY_PAGE = { items: [], total: 0, page: 1, pageCount: 1, pageSize: 50 };

vi.mock('@/modules/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksModule>()),
  listTasks: (...args: unknown[]) => listTasks(...args),
  listProjectTasks: (...args: unknown[]) => listProjectTasks(...args),
  getTaskByNumber: (session: unknown, ws: string, n: number) => getTaskByNumber(session, ws, n),
  createTask: (...args: unknown[]) => createTask(...args),
  updateTask: (...args: unknown[]) => updateTask(...args),
  addToProject: (...args: unknown[]) => addToProject(...args),
  changeStatus: (...args: unknown[]) => changeStatus(...args),
  setTaskParent: (...args: unknown[]) => setTaskParent(...args),
  createComment: (...args: unknown[]) => createComment(...args),
  resolveTaskRefs: (...args: unknown[]) => resolveTaskRefs(...args),
}));
vi.mock('@/modules/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectsModule>()),
  listProjects: () =>
    Promise.resolve([
      { id: P_DEV, name: 'Разработка' },
      { id: P_OPS, name: 'Инфраструктура' },
    ]),
  listWorkspaceStatuses: () =>
    Promise.resolve({
      [P_DEV]: [
        { id: S_DONE, name: 'Готово', category: 'done', position: 3 },
        { id: S_TODO, name: 'К выполнению', category: 'todo', position: 1 },
        { id: S_WORK, name: 'В работе', category: 'in_progress', position: 2 },
      ],
      [P_OPS]: [{ id: S_OPS, name: 'Бэклог', category: 'todo', position: 1 }],
    }),
}));
vi.mock('@/modules/workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspacesModule>()),
  listMemberIdentities: () =>
    Promise.resolve([
      { userId: 'u-1', name: 'Анна', email: 'anna@example.com', image: null },
      { userId: 'u-2', name: 'Борис', email: 'boris@example.com', image: null },
    ]),
}));
vi.mock('@/modules/integrations/github', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubModule>()),
  getWorkspaceGithubSummary: (...args: unknown[]) => getSummary(...args),
  listTaskPullRequests: () => Promise.resolve([]),
  listTaskBranchesAndCommits: () => Promise.resolve({ branches: [], commits: [], commitsTotal: 0 }),
}));

const { listTasksTool } = await import('./read-tools');
const { createTaskTool, setTaskParentTool, setTaskStatusTool, updateTaskTool, addCommentTool } =
  await import('./write-tools');
const { previewGithubLinksTool } = await import('./github-tools');

const ctx: McpContext = {
  session: {
    user: {
      id: 'u-1',
      email: 'anna@example.com',
      name: 'Анна',
      image: null,
      role: 'user',
      banned: false,
    },
    session: { id: 'api-token:t-1', expiresAt: new Date('2030-01-01') },
  },
  workspace: { id: 'ws-1', slug: 'team', name: 'Команда', taskKey: 'TSK' },
  tokenId: 't-1',
  tokenPrefix: 'tkr_abcdefgh',
  baseUrl: 'http://localhost:3000',
};

function placement(projectId: string, projectName: string, statusId: string, statusName: string) {
  return {
    projectId,
    projectName,
    statusId,
    statusName,
    statusColor: 'gray' as const,
    statusCategory: 'todo' as const,
  };
}

function task(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 'task-42',
    number: 42,
    key: 'TSK-42',
    title: 'Починить вход',
    description: null,
    priority: 'none',
    dueDate: null,
    isOverdue: false,
    assignee: null,
    createdBy: null,
    createdAt: new Date('2026-10-16T10:00:00Z'),
    updatedAt: new Date('2026-10-16T10:00:00Z'),
    placements: [placement(P_DEV, 'Разработка', S_TODO, 'К выполнению')],
    canDelete: true,
    ancestors: [],
    descendantCount: 0,
    subtaskProgress: { total: 0, done: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listTasks.mockResolvedValue(EMPTY_PAGE);
  listProjectTasks.mockResolvedValue(EMPTY_PAGE);
  getTaskByNumber.mockImplementation((_s, _ws, number) =>
    Promise.resolve(task({ id: `task-${number}`, number, key: `TSK-${number}` })),
  );
  createTask.mockResolvedValue({ taskId: 'task-43', number: 43 });
  createComment.mockResolvedValue({ commentId: 'c-1' });
  getSummary.mockResolvedValue({ enabled: true, repositories: [], automations: [] });
});

describe('list_tasks', () => {
  function lastQuery(fn: typeof listTasks): TaskListQuery {
    return fn.mock.calls.at(-1)!.at(-1) as TaskListQuery;
  }

  it('собирает запрос списка пространства: поиск, категория, ответственный, верхний уровень', async () => {
    await listTasksTool(ctx, {
      query: 'вход',
      status: 'in progress',
      assignee: 'boris@example.com',
      topLevelOnly: true,
      priority: ['high', 'urgent'],
      page: 2,
    });
    expect(listTasks.mock.calls[0]![1]).toBe('ws-1');
    expect(lastQuery(listTasks)).toMatchObject({
      q: 'вход',
      categories: ['in_progress'],
      assignees: ['u-2'],
      topLevelOnly: true,
      priorities: ['high', 'urgent'],
      page: 2,
    });
  });

  it('проект без статуса — фильтр проекта; "none" — задачи вне досок', async () => {
    await listTasksTool(ctx, { project: 'разработка' });
    expect(lastQuery(listTasks).projects).toEqual([P_DEV]);
    await listTasksTool(ctx, { status: 'none', assignee: 'me' });
    expect(lastQuery(listTasks)).toMatchObject({ categories: ['none'], assignees: ['me'] });
  });

  it('проект и статус — список проекта по всем статусам категории', async () => {
    await listTasksTool(ctx, { project: 'Разработка', status: 'todo', sort: 'status' });
    expect(listProjectTasks.mock.calls[0]![2]).toBe(P_DEV);
    expect(lastQuery(listProjectTasks)).toMatchObject({ statuses: [S_TODO], sort: 'status' });
  });

  it('название статуса без проекта — понятная ошибка', async () => {
    await expect(listTasksTool(ctx, { status: 'Ревью' })).rejects.toThrow(/вместе с project/);
  });
});

describe('create_task', () => {
  it('задача верхнего уровня встаёт в первый todo-статус указанного проекта', async () => {
    const text = await createTaskTool(ctx, {
      title: 'Новая',
      project: 'Разработка',
      assignee: 'me',
      priority: 'high',
    });
    expect(createTask).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      title: 'Новая',
      description: undefined,
      priority: 'high',
      dueDate: undefined,
      assigneeId: 'u-1',
      placement: { projectId: P_DEV, statusId: S_TODO },
      parentId: undefined,
    });
    expect(text).toContain('Created **TSK-43** Новая');
    expect(text).toContain('http://localhost:3000/w/team/tasks/43');
    expect(text).toContain('Suggested branch: `tsk-43-novaya`');
  });

  it('подзадача без проекта не размещается', async () => {
    const text = await createTaskTool(ctx, { title: 'Шаг 1', parent: 'TSK-42' });
    expect(getTaskByNumber).toHaveBeenCalledWith(ctx.session, 'ws-1', 42);
    expect(createTask.mock.calls[0]![1]).toMatchObject({
      parentId: 'task-42',
      placement: undefined,
    });
    expect(text).toContain('Subtask of TSK-42');
    expect(text).toContain('Not on any board');
  });

  it('статус без проекта при нескольких проектах — ошибка', async () => {
    await expect(createTaskTool(ctx, { title: 'X', status: 'todo' })).rejects.toThrow(
      /status задаётся вместе с project/,
    );
    expect(createTask).not.toHaveBeenCalled();
  });
});

describe('update_task', () => {
  it('null очищает поле, undefined не трогает', async () => {
    await updateTaskTool(ctx, { task: 'TSK-42', description: null, dueDate: null, assignee: null });
    expect(updateTask).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      taskId: 'task-42',
      title: undefined,
      description: null,
      priority: undefined,
      dueDate: null,
      assigneeId: null,
    });
  });

  it('без полей — ошибка', async () => {
    await expect(updateTaskTool(ctx, { task: 42 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('set_task_status', () => {
  it('одно размещение — проект можно не указывать', async () => {
    const text = await setTaskStatusTool(ctx, { task: 'TSK-42', status: 'in_progress' });
    expect(changeStatus).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      taskId: 'task-42',
      projectId: P_DEV,
      statusId: S_WORK,
    });
    expect(text).toContain('«К выполнению» → «В работе»');
  });

  it('тот же статус — без изменений', async () => {
    const text = await setTaskStatusTool(ctx, { task: 42, status: 'К выполнению' });
    expect(changeStatus).not.toHaveBeenCalled();
    expect(text).toContain('already');
  });

  it('задачи нет в проекте — добавляет её туда', async () => {
    await setTaskStatusTool(ctx, { task: 42, status: 'todo', project: 'Инфраструктура' });
    expect(addToProject).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      taskId: 'task-42',
      projectId: P_OPS,
      statusId: S_OPS,
    });
  });

  it('ни одного или несколько размещений без project — ошибка со списком', async () => {
    getTaskByNumber.mockResolvedValueOnce(task({ placements: [] }));
    await expect(setTaskStatusTool(ctx, { task: 42, status: 'todo' })).rejects.toThrow(
      /не размещена ни в одном проекте.*«Разработка», «Инфраструктура»/,
    );
    getTaskByNumber.mockResolvedValueOnce(
      task({
        placements: [
          placement(P_DEV, 'Разработка', S_TODO, 'К выполнению'),
          placement(P_OPS, 'Инфраструктура', S_OPS, 'Бэклог'),
        ],
      }),
    );
    await expect(setTaskStatusTool(ctx, { task: 42, status: 'todo' })).rejects.toThrow(
      /в нескольких проектах/,
    );
  });
});

describe('set_task_parent и add_comment', () => {
  it('null — задача верхнего уровня', async () => {
    const text = await setTaskParentTool(ctx, { task: 'TSK-42', parent: null });
    expect(setTaskParent).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      taskId: 'task-42',
      parentId: null,
    });
    expect(text).toContain('top-level');
  });

  it('комментарий уходит в сервис комментариев', async () => {
    await addCommentTool(ctx, { task: 'TSK-42', body: 'Готово, @Борис' });
    expect(createComment).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      taskId: 'task-42',
      body: 'Готово, @Борис',
    });
  });
});

describe('runTool', () => {
  it('ошибки домена — isError с текстом, неожиданные — общий текст', async () => {
    setTaskParent.mockRejectedValueOnce(
      new ValidationError('Нельзя сделать задачу подзадачей её собственной подзадачи'),
    );
    const cycle = await runTool(ctx, 'set_task_parent', () =>
      setTaskParentTool(ctx, { task: 1, parent: 2 }),
    );
    expect(cycle).toEqual({
      isError: true,
      content: [
        { type: 'text', text: 'Нельзя сделать задачу подзадачей её собственной подзадачи' },
      ],
    });

    createComment.mockRejectedValueOnce(new ForbiddenError());
    const forbidden = await runTool(ctx, 'add_comment', () =>
      addCommentTool(ctx, { task: 1, body: 'x' }),
    );
    expect(forbidden.isError).toBe(true);
    expect(forbidden.content).toEqual([{ type: 'text', text: 'Недостаточно прав' }]);

    const crash = await runTool(ctx, 'x', () => Promise.reject(new Error('db down')));
    expect(crash.isError).toBe(true);
    expect(JSON.stringify(crash.content)).not.toContain('db down');
  });

  it('чужой ключ задачи — isError', async () => {
    const result = await runTool(ctx, 'get_task', () =>
      updateTaskTool(ctx, { task: 'ABC-1', title: 'x' }),
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('TSK');
  });
});

describe('preview_github_links', () => {
  it('одна задача пространства в подключённом репозитории — OK', async () => {
    resolveTaskRefs.mockResolvedValue([{ number: 42, key: 'TSK-42', title: 'Починить вход' }]);
    getSummary.mockResolvedValue({
      enabled: true,
      repositories: [{ fullName: 'acme/api', suspended: false }],
      automations: [],
    });
    const text = await previewGithubLinksTool(ctx, {
      text: 'tsk-42-pochinit-vhod',
      repository: 'ACME/api',
    });
    expect(resolveTaskRefs).toHaveBeenCalledWith('ws-1', [42]);
    expect(text).toContain('OK — links to exactly one task.');
  });

  it('чужой ключ, несуществующая задача, TSK-012 и неподключённый репозиторий', async () => {
    resolveTaskRefs.mockResolvedValue([]);
    const text = await previewGithubLinksTool(ctx, {
      text: 'TSK-7: fix (see ABC-1, TSK-012)',
      repository: 'acme/other',
    });
    expect(text).toContain('References found: 2');
    expect(text).toContain('TSK-7 → no such task');
    expect(text).toContain('ABC-1 → other key');
    expect(text).not.toContain('TSK-12');
    expect(text).toContain('acme/other is not connected');
  });

  it('ключа нет — подсказка формата', async () => {
    resolveTaskRefs.mockResolvedValue([]);
    const text = await previewGithubLinksTool(ctx, { text: 'fix-login' });
    expect(text).toContain('No task key found. Add it, e.g. "TSK-42"');
  });
});
