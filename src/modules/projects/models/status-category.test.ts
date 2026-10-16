import { describe, expect, it } from 'vitest';

import { completionPercent, countTasksByCategory } from './status-category';

describe('countTasksByCategory', () => {
  it('returns zeros for a project without statuses', () => {
    expect(countTasksByCategory([])).toEqual({ todo: 0, in_progress: 0, done: 0 });
  });

  it('sums tasks of several statuses in one category', () => {
    expect(
      countTasksByCategory([
        { category: 'todo', tasksCount: 2 },
        { category: 'in_progress', tasksCount: 1 },
        { category: 'in_progress', tasksCount: 4 },
        { category: 'done', tasksCount: 7 },
        { category: 'todo', tasksCount: 0 },
      ]),
    ).toEqual({ todo: 2, in_progress: 5, done: 7 });
  });
});

describe('completionPercent', () => {
  it('is null without tasks', () => {
    expect(completionPercent({ todo: 0, in_progress: 0, done: 0 })).toBeNull();
  });

  it('rounds the share of done tasks', () => {
    expect(completionPercent({ todo: 6, in_progress: 3, done: 2 })).toBe(18);
    expect(completionPercent({ todo: 0, in_progress: 0, done: 4 })).toBe(100);
    expect(completionPercent({ todo: 3, in_progress: 0, done: 0 })).toBe(0);
  });
});
