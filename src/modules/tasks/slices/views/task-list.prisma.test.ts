import { describe, expect, it } from 'vitest';

import { defaultTaskListQuery, type TaskListQuery } from '../../models';
import {
  buildMyTaskWhere,
  buildPlacementOrderBy,
  buildPlacementWhere,
  buildTaskOrderBy,
  buildTaskWhere,
} from './task-list.prisma';

const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';
const STATUS_ID = '0192f3a0-0000-7000-8000-000000000002';
const ctx = { workspaceId: 'ws-1', userId: 'user-1', today: '2026-10-16' } as const;

function workspaceQuery(patch: Partial<TaskListQuery>): TaskListQuery {
  return { ...defaultTaskListQuery('workspace'), ...patch };
}

describe('buildTaskWhere', () => {
  it('always filters by workspace and hides archived tasks', () => {
    expect(buildTaskWhere(workspaceQuery({}), { ...ctx, scope: 'workspace' })).toEqual({
      workspaceId: 'ws-1',
      archivedAt: null,
    });
  });

  it('archived mode shows only archived tasks', () => {
    expect(
      buildTaskWhere(workspaceQuery({ archived: true }), { ...ctx, scope: 'workspace' }).archivedAt,
    ).toEqual({ not: null });
  });

  it('searches by title and by task number', () => {
    expect(buildTaskWhere(workspaceQuery({ q: '#42' }), { ...ctx, scope: 'workspace' })).toEqual({
      workspaceId: 'ws-1',
      archivedAt: null,
      AND: [{ OR: [{ title: { contains: '#42', mode: 'insensitive' } }, { number: 42 }] }],
    });
    expect(
      buildTaskWhere(workspaceQuery({ q: 'шапка' }), { ...ctx, scope: 'workspace' }).AND,
    ).toEqual([{ OR: [{ title: { contains: 'шапка', mode: 'insensitive' } }] }]);
  });

  it('expands me and none for assignees', () => {
    const where = buildTaskWhere(workspaceQuery({ assignees: ['me', 'none', 'user-2'] }), {
      ...ctx,
      scope: 'workspace',
    });
    expect(where.AND).toEqual([
      { OR: [{ assigneeId: { in: ['user-1', 'user-2'] } }, { assigneeId: null }] },
    ]);
  });

  it('filters priorities', () => {
    expect(
      buildTaskWhere(workspaceQuery({ priorities: ['high', 'urgent'] }), {
        ...ctx,
        scope: 'workspace',
      }).AND,
    ).toEqual([{ priority: { in: ['high', 'urgent'] } }]);
  });

  it('top level only excludes subtasks in both scopes', () => {
    const query = workspaceQuery({ topLevelOnly: true });
    expect(buildTaskWhere(query, { ...ctx, scope: 'workspace' }).AND).toEqual([{ parentId: null }]);
    expect(buildTaskWhere(query, { ...ctx, scope: 'project' }).AND).toEqual([{ parentId: null }]);
  });

  it('overdue in workspace excludes done tasks', () => {
    const where = buildTaskWhere(workspaceQuery({ due: 'overdue' }), {
      ...ctx,
      scope: 'workspace',
    });
    expect(where.AND).toEqual([
      { dueDate: { lt: new Date('2026-10-16T00:00:00.000Z') } },
      {
        NOT: {
          AND: [
            { placements: { some: {} } },
            { placements: { every: { status: { category: 'done' } } } },
          ],
        },
      },
    ]);
  });

  it('due week and none', () => {
    expect(
      buildTaskWhere(workspaceQuery({ due: 'week' }), { ...ctx, scope: 'workspace' }).AND,
    ).toEqual([
      {
        dueDate: {
          gte: new Date('2026-10-16T00:00:00.000Z'),
          lte: new Date('2026-10-22T00:00:00.000Z'),
        },
      },
    ]);
    expect(
      buildTaskWhere(workspaceQuery({ due: 'none' }), { ...ctx, scope: 'workspace' }).AND,
    ).toEqual([{ dueDate: null }]);
  });

  it('categories and projects with «outside projects»', () => {
    const where = buildTaskWhere(
      workspaceQuery({ categories: ['todo', 'none'], projects: [PROJECT_ID] }),
      { ...ctx, scope: 'workspace' },
    );
    expect(where.AND).toEqual([
      {
        OR: [
          { placements: { some: { status: { category: { in: ['todo'] } } } } },
          { placements: { none: {} } },
        ],
      },
      { OR: [{ placements: { some: { projectId: { in: [PROJECT_ID] } } } }] },
    ]);
  });

  it('ignores workspace-only filters in project scope', () => {
    expect(
      buildTaskWhere(workspaceQuery({ categories: ['todo'], projects: ['none'] }), {
        ...ctx,
        scope: 'project',
      }),
    ).toEqual({ workspaceId: 'ws-1', archivedAt: null });
  });
});

describe('buildPlacementWhere', () => {
  it('scopes to the project, its statuses and the task filters', () => {
    const where = buildPlacementWhere(
      { ...defaultTaskListQuery('project'), statuses: [STATUS_ID], due: 'overdue' },
      { ...ctx, projectId: PROJECT_ID },
    );
    expect(where).toEqual({
      workspaceId: 'ws-1',
      projectId: PROJECT_ID,
      statusId: { in: [STATUS_ID] },
      status: { category: { not: 'done' } },
      task: {
        workspaceId: 'ws-1',
        archivedAt: null,
        AND: [{ dueDate: { lt: new Date('2026-10-16T00:00:00.000Z') } }],
      },
    });
  });
});

describe('order by', () => {
  it.each([
    ['number', 'asc', [{ number: 'asc' }]],
    ['title', 'asc', [{ title: 'asc' }, { number: 'desc' }]],
    ['priority', 'desc', [{ priority: 'desc' }, { number: 'desc' }]],
    ['due', 'desc', [{ dueDate: { sort: 'desc', nulls: 'last' } }, { number: 'desc' }]],
  ] as const)('task: %s %s', (sort, dir, expected) => {
    expect(buildTaskOrderBy(sort, dir)).toEqual(expected);
  });

  it('placement by status follows the board', () => {
    expect(buildPlacementOrderBy('status', 'asc')).toEqual([
      { status: { position: 'asc' } },
      { position: 'asc' },
      { taskId: 'asc' },
    ]);
  });

  it('placement by task field wraps the task order', () => {
    expect(buildPlacementOrderBy('due', 'asc')).toEqual([
      { task: { dueDate: { sort: 'asc', nulls: 'last' } } },
      { task: { number: 'desc' } },
    ]);
  });
});

describe('buildMyTaskWhere', () => {
  const mineCtx = { userId: 'user-1', today: '2026-10-16', workspaceIds: ['ws-1', 'ws-2'] };

  it('takes my open active tasks in the given workspaces', () => {
    expect(buildMyTaskWhere(defaultTaskListQuery('mine'), mineCtx)).toEqual({
      workspaceId: { in: ['ws-1', 'ws-2'] },
      assigneeId: 'user-1',
      archivedAt: null,
      AND: [
        {
          OR: [
            { placements: { none: {} } },
            { placements: { some: { status: { category: { not: 'done' } } } } },
          ],
        },
      ],
    });
  });

  it('a category filter replaces the open-only condition', () => {
    const where = buildMyTaskWhere(
      { ...defaultTaskListQuery('mine'), categories: ['done'] },
      mineCtx,
    );
    expect(where.AND).toEqual([
      { OR: [{ placements: { some: { status: { category: { in: ['done'] } } } } }] },
    ]);
  });

  it('overdue excludes done tasks like in the workspace list', () => {
    const where = buildMyTaskWhere({ ...defaultTaskListQuery('mine'), due: 'overdue' }, mineCtx);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { dueDate: { lt: new Date('2026-10-16T00:00:00.000Z') } },
        expect.objectContaining({ NOT: expect.anything() }),
      ]),
    );
  });
});
