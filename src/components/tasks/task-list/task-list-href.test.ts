import { describe, expect, it } from 'vitest';

import { defaultTaskListQuery } from '@/modules/tasks/client';

import { taskExportHref, taskListHref } from './task-list-href';

const WS = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

describe('taskListHref', () => {
  it('«Мои задачи» without filters is the bare path', () => {
    expect(taskListHref('/my-tasks', defaultTaskListQuery('mine'), 'mine')).toBe('/my-tasks');
  });

  it('keeps the workspace filter and drops filters of other lists', () => {
    const query = {
      ...defaultTaskListQuery('mine'),
      workspaces: [WS],
      assignees: ['me'],
      labels: [WS],
      page: 2,
    };
    expect(taskListHref('/my-tasks', query, 'mine')).toBe(`/my-tasks?workspace=${WS}&page=2`);
  });
});

describe('taskExportHref', () => {
  const PROJECT = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

  it('drops the page and adds the project of the tab', () => {
    const query = { ...defaultTaskListQuery('project'), priorities: ['high' as const], page: 4 };
    expect(taskExportHref('/api/w/a/tasks/export', query, 'project', PROJECT)).toBe(
      `/api/w/a/tasks/export?priority=high&projectId=${PROJECT}`,
    );
    expect(
      taskExportHref('/api/w/a/tasks/export', defaultTaskListQuery('workspace'), 'workspace'),
    ).toBe('/api/w/a/tasks/export');
  });
});
