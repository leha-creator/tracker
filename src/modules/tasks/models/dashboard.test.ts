import { describe, expect, it } from 'vitest';

import { addIsoDays, barPercent, buildDashboard, type DashboardCounts } from './dashboard';

const counts: DashboardCounts = { open: 5, overdue: 2, dueWeek: 1, unassigned: 1, doneLast7: 3 };
const member = (userId: string, name: string) => ({ userId, name, image: null, isAgent: false });

describe('buildDashboard', () => {
  it('orders workload by overdue, then open, then name, keeping members without tasks', () => {
    const model = buildDashboard({
      counts,
      members: [member('u1', 'Борис'), member('u2', 'Анна'), member('u3', 'Вера')],
      assignees: [
        { assigneeId: 'u1', open: 3, overdue: 0 },
        { assigneeId: 'u2', open: 1, overdue: 1 },
        { assigneeId: null, open: 1, overdue: 1 },
      ],
      projects: [],
    });
    expect(model.workload.map((row) => [row.userId, row.open, row.overdue])).toEqual([
      ['u2', 1, 1],
      ['u1', 3, 0],
      ['u3', 0, 0],
    ]);
    expect(model.maxBar).toBe(3);
  });

  it('ignores an assignee who is no longer a member', () => {
    const model = buildDashboard({
      counts,
      members: [member('u1', 'Анна')],
      assignees: [{ assigneeId: 'gone', open: 9, overdue: 9 }],
      projects: [],
    });
    expect(model.workload).toEqual([{ ...member('u1', 'Анна'), open: 0, overdue: 0 }]);
    expect(model.maxBar).toBe(1);
  });

  it('orders projects by open tasks and scales bars to the biggest row', () => {
    const model = buildDashboard({
      counts,
      members: [],
      assignees: [],
      projects: [
        { projectId: 'p1', name: 'Сайт', open: 2, overdue: 0 },
        { projectId: 'p2', name: 'Бренд', open: 7, overdue: 1 },
        { projectId: 'p3', name: 'Альфа', open: 2, overdue: 0 },
      ],
    });
    expect(model.projects.map((row) => row.projectId)).toEqual(['p2', 'p3', 'p1']);
    expect(model.maxBar).toBe(7);
  });

  it('an empty workspace still has a usable scale', () => {
    const empty = { open: 0, overdue: 0, dueWeek: 0, unassigned: 0, doneLast7: 0 };
    expect(buildDashboard({ counts: empty, members: [], assignees: [], projects: [] })).toEqual({
      counts: empty,
      workload: [],
      projects: [],
      maxBar: 1,
    });
  });
});

describe('barPercent', () => {
  it('is zero for nothing and at least 2 % for something', () => {
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(1, 1000)).toBe(2);
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(10, 10)).toBe(100);
  });
});

describe('addIsoDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addIsoDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addIsoDays('2026-12-28', 6)).toBe('2027-01-03');
  });
});
