import { describe, expect, it } from 'vitest';

import {
  describeHistoryChange,
  diffTaskFields,
  HISTORY_MERGE_WINDOW_MS,
  mergeHistoryChange,
  parseHistoryData,
  shouldMergeHistory,
  type TaskFieldsSnapshot,
  type TaskHistoryChange,
} from './task-history';

const before: TaskFieldsSnapshot = {
  title: 'Старое',
  description: null,
  priority: 'none',
  dueDate: null,
  assignee: null,
};

const ann = { id: 'u1', name: 'Анна' };
const bob = { id: 'u2', name: 'Борис' };

describe('diffTaskFields', () => {
  it('returns nothing when values are the same', () => {
    expect(diffTaskFields(before, { title: 'Старое', priority: 'none', dueDate: null })).toEqual(
      [],
    );
  });

  it('records each changed field', () => {
    const changes = diffTaskFields(before, {
      title: 'Новое',
      priority: 'high',
      dueDate: '2026-10-20',
      assignee: ann,
    });
    expect(changes.map((change) => change.kind)).toEqual([
      'title',
      'priority',
      'due_date',
      'assignee',
    ]);
    expect(changes[3]).toEqual({ kind: 'assignee', data: { from: null, to: ann } });
  });

  it('records clearing a value', () => {
    expect(
      diffTaskFields(
        { ...before, dueDate: '2026-10-20', assignee: ann },
        {
          dueDate: null,
          assignee: null,
        },
      ),
    ).toEqual([
      { kind: 'due_date', data: { from: '2026-10-20', to: null } },
      { kind: 'assignee', data: { from: ann, to: null } },
    ]);
  });

  it('stores only presence of the description', () => {
    expect(diffTaskFields(before, { description: 'Текст' })).toEqual([
      { kind: 'description', data: { from: false, to: true } },
    ]);
    expect(diffTaskFields({ ...before, description: 'a' }, { description: 'b' })).toEqual([
      { kind: 'description', data: { from: true, to: true } },
    ]);
    // null и пустая строка — одно и то же.
    expect(diffTaskFields(before, { description: '' })).toEqual([]);
  });

  it('compares assignees by id', () => {
    expect(
      diffTaskFields({ ...before, assignee: ann }, { assignee: { ...ann, name: 'А.' } }),
    ).toEqual([]);
  });
});

describe('shouldMergeHistory', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const author = { actorId: 'u1', viaTokenId: null, source: null };
  const previous = {
    ...author,
    kind: 'title' as const,
    updatedAt: new Date(now.getTime() - 60_000),
  };

  it('merges the same field by the same author within the window', () => {
    expect(shouldMergeHistory(previous, { ...author, kind: 'title' }, now)).toBe(true);
  });

  it('does not merge outside the window', () => {
    const old = { ...previous, updatedAt: new Date(now.getTime() - HISTORY_MERGE_WINDOW_MS - 1) };
    expect(shouldMergeHistory(old, { ...author, kind: 'title' }, now)).toBe(false);
  });

  it('does not merge another field, author or path', () => {
    expect(shouldMergeHistory(previous, { ...author, kind: 'priority' }, now)).toBe(false);
    expect(shouldMergeHistory(previous, { ...author, actorId: 'u2', kind: 'title' }, now)).toBe(
      false,
    );
    expect(shouldMergeHistory(previous, { ...author, viaTokenId: 't1', kind: 'title' }, now)).toBe(
      false,
    );
  });

  it('never merges status, assignee or system changes', () => {
    const status = { ...previous, kind: 'status' as const };
    expect(shouldMergeHistory(status, { ...author, kind: 'status' }, now)).toBe(false);
    const system = { ...previous, actorId: null, source: 'github' };
    expect(
      shouldMergeHistory(
        system,
        { actorId: null, viaTokenId: null, source: 'github', kind: 'title' },
        now,
      ),
    ).toBe(false);
    expect(shouldMergeHistory(null, { ...author, kind: 'title' }, now)).toBe(false);
  });
});

describe('mergeHistoryChange', () => {
  it('keeps the first from and the last to', () => {
    expect(
      mergeHistoryChange(
        { kind: 'title', data: { from: 'A', to: 'B' } },
        { kind: 'title', data: { from: 'B', to: 'C' } },
      ),
    ).toEqual({ kind: 'title', data: { from: 'A', to: 'C' } });
  });

  it('returns null when the value went back', () => {
    expect(
      mergeHistoryChange(
        { kind: 'priority', data: { from: 'low', to: 'high' } },
        { kind: 'priority', data: { from: 'high', to: 'low' } },
      ),
    ).toBeNull();
  });
});

describe('parseHistoryData', () => {
  it('accepts valid data', () => {
    expect(parseHistoryData('title', { from: 'A', to: 'B' })).toEqual({ from: 'A', to: 'B' });
  });

  it('rejects inconsistent data', () => {
    expect(parseHistoryData('title', { from: 1 })).toBeNull();
    expect(parseHistoryData('due_date', { from: 'вчера', to: null })).toBeNull();
  });
});

describe('describeHistoryChange', () => {
  const project = { id: 'p1', name: 'Разработка' };
  const todo = { id: 's1', name: 'К выполнению' };
  const doing = { id: 's2', name: 'В работе' };
  const parent = { id: 't1', number: 1, key: 'TSK-1', title: 'Эпик' };

  const cases: [TaskHistoryChange, string][] = [
    [{ kind: 'created', data: {} }, 'Задача создана'],
    [{ kind: 'title', data: { from: 'A', to: 'B' } }, 'Название: «A» → «B»'],
    [{ kind: 'description', data: { from: false, to: true } }, 'Описание добавлено'],
    [{ kind: 'description', data: { from: true, to: true } }, 'Описание изменено'],
    [{ kind: 'description', data: { from: true, to: false } }, 'Описание удалено'],
    [{ kind: 'priority', data: { from: 'low', to: 'urgent' } }, 'Приоритет: Низкий → Срочный'],
    [
      { kind: 'due_date', data: { from: null, to: '2026-10-20' } },
      'Срок: не задан → 20 окт. 2026 г.',
    ],
    [{ kind: 'assignee', data: { from: ann, to: bob } }, 'Ответственный: Анна → Борис'],
    [{ kind: 'assignee', data: { from: ann, to: null } }, 'Ответственный: Анна → не назначен'],
    [
      { kind: 'status', data: { project, from: todo, to: doing } },
      'Статус в «Разработка»: К выполнению → В работе',
    ],
    [
      { kind: 'project_added', data: { project, status: todo } },
      'Добавлена в проект «Разработка» (К выполнению)',
    ],
    [{ kind: 'project_removed', data: { project } }, 'Убрана из проекта «Разработка»'],
    [{ kind: 'parent', data: { from: null, to: parent } }, 'Родитель: нет → TSK-1 «Эпик»'],
    [{ kind: 'parent', data: { from: parent, to: null } }, 'Больше не подзадача TSK-1 «Эпик»'],
    [
      {
        kind: 'labels',
        data: { added: [{ id: 'l1', name: 'bug' }], removed: [{ id: 'l2', name: 'ui' }] },
      },
      'Метки: +bug, −ui',
    ],
    [{ kind: 'archived', data: { descendants: 0 } }, 'Отправлена в архив'],
    [{ kind: 'archived', data: { descendants: 2 } }, 'Отправлена в архив вместе с подзадачами (2)'],
    [{ kind: 'restored', data: { descendants: 0 } }, 'Восстановлена из архива'],
  ];

  it.each(cases)('%j', (change, text) => {
    expect(describeHistoryChange(change)).toBe(text);
  });
});
