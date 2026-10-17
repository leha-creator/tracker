import { describe, expect, it } from 'vitest';

import {
  clearFilters,
  defaultTaskListQuery,
  dueDateRange,
  hasActiveFilters,
  pageBounds,
  pageCountOf,
  paginationRange,
  parseTaskListParams,
  parseTaskNumberQuery,
  patchTaskListQuery,
  serializeTaskListParams,
  TASK_LIST_MAX_VALUES,
  TASK_LIST_QUERY_MAX_LENGTH,
  toggleSort,
} from './task-list-query';

const PROJECT_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const STATUS_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

describe('parseTaskListParams', () => {
  it('пустые параметры → значения по умолчанию', () => {
    expect(parseTaskListParams({}, 'workspace')).toEqual(defaultTaskListQuery('workspace'));
    expect(parseTaskListParams({}, 'project')).toEqual(defaultTaskListQuery('project'));
    expect(defaultTaskListQuery('workspace')).toMatchObject({ sort: 'number', dir: 'desc' });
    expect(defaultTaskListQuery('project')).toMatchObject({ sort: 'status', dir: 'asc' });
  });

  it('разбирает все фильтры пространства', () => {
    const query = parseTaskListParams(
      {
        q: '  шапка   сайта ',
        project: `${PROJECT_ID},none`,
        category: 'todo,done',
        priority: 'high,urgent',
        assignee: 'me,none,user_1',
        due: 'overdue',
        level: 'top',
        sort: 'due',
        dir: 'desc',
        page: '3',
      },
      'workspace',
    );
    expect(query).toEqual({
      q: 'шапка сайта',
      statuses: [],
      categories: ['todo', 'done'],
      projects: [PROJECT_ID, 'none'],
      priorities: ['high', 'urgent'],
      assignees: ['me', 'none', 'user_1'],
      labels: [],
      due: 'overdue',
      topLevelOnly: true,
      archived: false,
      sort: 'due',
      dir: 'desc',
      page: 3,
    });
  });

  it('level: только значение top включает фильтр верхнего уровня', () => {
    expect(parseTaskListParams({ level: 'top' }, 'project').topLevelOnly).toBe(true);
    expect(parseTaskListParams({ level: 'all' }, 'workspace').topLevelOnly).toBe(false);
    expect(hasActiveFilters({ ...defaultTaskListQuery('workspace'), topLevelOnly: true })).toBe(
      true,
    );
  });

  it('label: только id меток, в обоих scope, туда и обратно через URL', () => {
    for (const scope of ['workspace', 'project'] as const) {
      const query = parseTaskListParams({ label: `${PROJECT_ID},bug,,${STATUS_ID}` }, scope);
      expect(query.labels).toEqual([PROJECT_ID, STATUS_ID]);
      expect(hasActiveFilters(query)).toBe(true);
      expect(serializeTaskListParams(query, scope)).toBe(`label=${PROJECT_ID}%2C${STATUS_ID}`);
    }
    expect(
      clearFilters(parseTaskListParams({ label: PROJECT_ID }, 'workspace'), 'workspace').labels,
    ).toEqual([]);
  });

  it('отбрасывает мусорные значения', () => {
    const query = parseTaskListParams(
      {
        priority: 'foo,high,',
        project: 'x,not-a-uuid',
        assignee: 'a b,<script>',
        due: 'tomorrow',
        sort: 'author',
        dir: 'up',
        page: '-1',
      },
      'workspace',
    );
    expect(query).toEqual({ ...defaultTaskListQuery('workspace'), priorities: ['high'] });
  });

  it.each(['abc', '0', '1.5', '', '9999999'])('page=%j → 1', (page) => {
    expect(parseTaskListParams({ page }, 'workspace').page).toBe(1);
  });

  it('повторяющийся ключ — берётся первое значение', () => {
    expect(parseTaskListParams({ priority: ['low', 'high'] }, 'workspace').priorities).toEqual([
      'low',
    ]);
  });

  it('удаляет повторы и ограничивает число значений', () => {
    const ids = Array.from({ length: 30 }, (_, index) => `user${index}`);
    expect(parseTaskListParams({ priority: 'low,low,high' }, 'workspace').priorities).toEqual([
      'low',
      'high',
    ]);
    expect(parseTaskListParams({ assignee: ids.join(',') }, 'workspace').assignees).toHaveLength(
      TASK_LIST_MAX_VALUES,
    );
  });

  it('обрезает строку поиска', () => {
    const q = 'a'.repeat(TASK_LIST_QUERY_MAX_LENGTH + 50);
    expect(parseTaskListParams({ q }, 'workspace').q).toHaveLength(TASK_LIST_QUERY_MAX_LENGTH);
  });

  it('игнорирует параметры чужого scope', () => {
    const raw = { status: STATUS_ID, project: PROJECT_ID, category: 'todo', sort: 'status' };
    const workspace = parseTaskListParams(raw, 'workspace');
    expect(workspace.statuses).toEqual([]);
    expect(workspace.sort).toBe('number');
    const project = parseTaskListParams(raw, 'project');
    expect(project.statuses).toEqual([STATUS_ID]);
    expect(project.projects).toEqual([]);
    expect(project.categories).toEqual([]);
  });

  it('без dir берёт направление по умолчанию для поля сортировки', () => {
    expect(parseTaskListParams({ sort: 'priority' }, 'workspace').dir).toBe('desc');
    expect(parseTaskListParams({ sort: 'title' }, 'workspace').dir).toBe('asc');
  });
});

describe('serializeTaskListParams', () => {
  it('значения по умолчанию опущены', () => {
    expect(serializeTaskListParams(defaultTaskListQuery('workspace'), 'workspace')).toBe('');
    expect(serializeTaskListParams(defaultTaskListQuery('project'), 'project')).toBe('');
  });

  it('стабильный порядок ключей', () => {
    const query = {
      ...defaultTaskListQuery('workspace'),
      page: 2,
      due: 'week' as const,
      assignees: ['me'],
      priorities: ['urgent' as const],
      projects: [PROJECT_ID],
      q: 'дизайн',
      sort: 'title' as const,
      dir: 'desc' as const,
    };
    expect(serializeTaskListParams(query, 'workspace')).toBe(
      `q=${encodeURIComponent('дизайн')}&project=${PROJECT_ID}&priority=urgent&assignee=me&due=week&sort=title&dir=desc&page=2`,
    );
  });

  it.each([
    [
      'workspace' as const,
      'q=%2342&project=none&category=in_progress&priority=low,high&assignee=none&due=none&level=top&sort=due&page=4',
    ],
    ['project' as const, `status=${STATUS_ID}&priority=none&sort=number&dir=asc`],
  ])('круговой разбор: %s', (scope, search) => {
    const query = parseTaskListParams(Object.fromEntries(new URLSearchParams(search)), scope);
    const again = parseTaskListParams(
      Object.fromEntries(new URLSearchParams(serializeTaskListParams(query, scope))),
      scope,
    );
    expect(again).toEqual(query);
  });
});

describe('patchTaskListQuery / toggleSort / clearFilters', () => {
  const base = { ...defaultTaskListQuery('workspace'), page: 3 };

  it('смена фильтра сбрасывает страницу', () => {
    expect(patchTaskListQuery(base, { priorities: ['high'] }).page).toBe(1);
  });

  it('смена только страницы её сохраняет', () => {
    expect(patchTaskListQuery(base, { page: 5 }).page).toBe(5);
  });

  it('toggleSort: другая колонка — направление по умолчанию, та же — переключение', () => {
    const byDue = toggleSort(base, 'due');
    expect(byDue).toMatchObject({ sort: 'due', dir: 'asc', page: 1 });
    expect(toggleSort(byDue, 'due')).toMatchObject({ sort: 'due', dir: 'desc' });
    expect(toggleSort(base, 'number')).toMatchObject({ sort: 'number', dir: 'asc' });
  });

  it('clearFilters сохраняет сортировку', () => {
    const query = { ...base, q: 'x', priorities: ['low' as const], sort: 'due' as const };
    expect(hasActiveFilters(query)).toBe(true);
    const cleared = clearFilters(query, 'workspace');
    expect(hasActiveFilters(cleared)).toBe(false);
    expect(cleared).toMatchObject({ sort: 'due', page: 1 });
  });
});

describe('parseTaskNumberQuery', () => {
  it.each([
    ['#42', 42],
    ['42', 42],
    [' #7 ', 7],
    ['0', null],
    ['#', null],
    ['abc', null],
    ['42 задача', null],
    ['TSK-42', 42],
    ['tsk-7', 7],
    ['WEB2-15', 15],
    ['2TSK-1', null],
    ['TSK-', null],
  ])('%j → %j', (q, expected) => {
    expect(parseTaskNumberQuery(q)).toBe(expected);
  });
});

describe('dueDateRange', () => {
  it('просрочено — строго раньше сегодня', () => {
    expect(dueDateRange('overdue', '2026-10-16')).toEqual({ kind: 'range', lt: '2026-10-16' });
  });

  it('сегодня', () => {
    expect(dueDateRange('today', '2026-10-16')).toEqual({
      kind: 'range',
      gte: '2026-10-16',
      lte: '2026-10-16',
    });
  });

  it.each([
    ['2026-10-16', '2026-10-22'],
    ['2026-10-28', '2026-11-03'],
    ['2026-12-29', '2027-01-04'],
    ['2028-02-25', '2028-03-02'],
  ])('на 7 дней от %s до %s', (today, last) => {
    expect(dueDateRange('week', today)).toEqual({ kind: 'range', gte: today, lte: last });
  });

  it('без срока', () => {
    expect(dueDateRange('none', '2026-10-16')).toEqual({ kind: 'none' });
  });
});

describe('страницы', () => {
  it.each([
    [0, 1],
    [1, 1],
    [50, 1],
    [51, 2],
    [230, 5],
  ])('pageCountOf(%d) = %d', (total, expected) => {
    expect(pageCountOf(total)).toBe(expected);
  });

  it('pageBounds', () => {
    expect(pageBounds(1, 0)).toEqual({ from: 0, to: 0 });
    expect(pageBounds(1, 30)).toEqual({ from: 1, to: 30 });
    expect(pageBounds(2, 230)).toEqual({ from: 51, to: 100 });
    expect(pageBounds(5, 230)).toEqual({ from: 201, to: 230 });
  });

  it.each([
    [1, 1, [1]],
    [3, 5, [1, 2, 3, 4, 5]],
    [1, 12, [1, 2, 'ellipsis', 12]],
    [6, 12, [1, 'ellipsis', 5, 6, 7, 'ellipsis', 12]],
    [12, 12, [1, 'ellipsis', 11, 12]],
    [4, 12, [1, 2, 3, 4, 5, 'ellipsis', 12]],
  ])('paginationRange(%d, %d)', (page, pageCount, expected) => {
    expect(paginationRange(page, pageCount)).toEqual(expected);
  });
});

describe('archived', () => {
  it('archived=1 включает режим «Архив», он переживает сброс фильтров', () => {
    const query = parseTaskListParams({ archived: '1', priority: 'high' }, 'workspace');
    expect(query.archived).toBe(true);
    expect(parseTaskListParams({ archived: 'yes' }, 'workspace').archived).toBe(false);
    expect(serializeTaskListParams(query, 'workspace')).toBe('priority=high&archived=1');
    expect(clearFilters(query, 'workspace')).toMatchObject({ archived: true, priorities: [] });
  });
});
