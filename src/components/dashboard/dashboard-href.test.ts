import { describe, expect, it } from 'vitest';

import { dashboardTasksHref, OPEN_CATEGORIES } from './dashboard-href';

describe('dashboardTasksHref', () => {
  it('builds a filtered workspace list link', () => {
    expect(dashboardTasksHref('studio', { due: 'overdue', assignees: ['u1'] })).toBe(
      '/w/studio/tasks?assignee=u1&due=overdue',
    );
    expect(dashboardTasksHref('studio', { categories: OPEN_CATEGORIES })).toBe(
      '/w/studio/tasks?category=todo%2Cin_progress%2Cnone',
    );
  });

  it('without filters is the bare list', () => {
    expect(dashboardTasksHref('studio', {})).toBe('/w/studio/tasks');
  });
});
