import { describe, expect, it } from 'vitest';

import {
  assertCanAddSubtask,
  assertCanMoveTask,
  summarizeSubtasks,
  TASK_MAX_DEPTH,
  TASK_SUBTASKS_LIMIT,
} from './task-tree';

describe('assertCanAddSubtask', () => {
  it('allows a subtask up to the maximum depth', () => {
    expect(() => assertCanAddSubtask(1, 0)).not.toThrow();
    expect(() => assertCanAddSubtask(TASK_MAX_DEPTH - 1, 0)).not.toThrow();
  });

  it('rejects a subtask deeper than the maximum', () => {
    expect(() => assertCanAddSubtask(TASK_MAX_DEPTH, 0)).toThrow(/Вложенность/);
    expect(() => assertCanAddSubtask(TASK_MAX_DEPTH + 1, 0)).toThrow(/Вложенность/);
  });

  it('rejects a subtask over the children limit', () => {
    expect(() => assertCanAddSubtask(1, TASK_SUBTASKS_LIMIT - 1)).not.toThrow();
    expect(() => assertCanAddSubtask(1, TASK_SUBTASKS_LIMIT)).toThrow(/не больше/);
  });
});

describe('assertCanMoveTask', () => {
  it('allows moving to the top level', () => {
    expect(() =>
      assertCanMoveTask({ taskId: 't', targetPathIds: [], subtreeHeight: TASK_MAX_DEPTH }),
    ).not.toThrow();
  });

  it('rejects moving a task under itself', () => {
    expect(() =>
      assertCanMoveTask({ taskId: 't', targetPathIds: ['t'], subtreeHeight: 1 }),
    ).toThrow(/собственной подзадачи/);
  });

  it('rejects moving a task under its descendant', () => {
    expect(() =>
      assertCanMoveTask({ taskId: 't', targetPathIds: ['root', 't', 'child'], subtreeHeight: 2 }),
    ).toThrow(/собственной подзадачи/);
  });

  it('checks the resulting depth including the subtree height', () => {
    const path = Array.from({ length: TASK_MAX_DEPTH - 3 }, (_, i) => `p${i}`);
    expect(() =>
      assertCanMoveTask({ taskId: 't', targetPathIds: path, subtreeHeight: 3 }),
    ).not.toThrow();
    expect(() => assertCanMoveTask({ taskId: 't', targetPathIds: path, subtreeHeight: 4 })).toThrow(
      /Вложенность/,
    );
  });
});

describe('summarizeSubtasks', () => {
  it('returns zeros without subtasks', () => {
    expect(summarizeSubtasks([])).toEqual({ total: 0, done: 0 });
  });

  it('counts a subtask done only when all its placements are done', () => {
    expect(
      summarizeSubtasks([
        { categories: [] },
        { categories: ['done'] },
        { categories: ['done', 'in_progress'] },
        { categories: ['done', 'done'] },
      ]),
    ).toEqual({ total: 4, done: 2 });
  });
});
