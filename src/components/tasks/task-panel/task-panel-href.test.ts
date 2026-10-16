import { describe, expect, it } from 'vitest';

import {
  newTaskPageHref,
  parseTaskPanelParam,
  parseTaskParentParam,
  taskPageHref,
  taskPanelHref,
  withSearchParam,
} from './task-panel-href';

describe('parseTaskPanelParam', () => {
  it('is closed without a value', () => {
    expect(parseTaskPanelParam(undefined)).toEqual({ mode: 'closed' });
    expect(parseTaskPanelParam('')).toEqual({ mode: 'closed' });
    expect(parseTaskPanelParam([])).toEqual({ mode: 'closed' });
  });

  it('opens the create form', () => {
    expect(parseTaskPanelParam('new')).toEqual({ mode: 'new' });
  });

  it('opens a task by number', () => {
    expect(parseTaskPanelParam('12')).toEqual({ mode: 'view', number: 12 });
  });

  it('takes the first value of a repeated param', () => {
    expect(parseTaskPanelParam(['7', '8'])).toEqual({ mode: 'view', number: 7 });
  });

  it.each(['0', '-1', '1.5', 'abc', '1e3', 'NEW'])('ignores %j', (value) => {
    expect(parseTaskPanelParam(value)).toEqual({ mode: 'closed' });
  });
});

describe('taskPanelHref', () => {
  it('opens a task and keeps list filters', () => {
    expect(taskPanelHref('/w/a/tasks', 'priority=high&sort=due', 5)).toBe(
      '/w/a/tasks?priority=high&sort=due&task=5',
    );
  });

  it('switches to another task', () => {
    expect(taskPanelHref('/w/a/tasks', '?task=5', 6)).toBe('/w/a/tasks?task=6');
  });

  it('opens the create form', () => {
    expect(taskPanelHref('/w/a/b', new URLSearchParams(), 'new')).toBe('/w/a/b?task=new');
  });

  it('closes the panel without a dangling question mark', () => {
    expect(taskPanelHref('/w/a/b', 'task=5', null)).toBe('/w/a/b');
  });

  it('closes the panel and keeps other params', () => {
    expect(taskPanelHref('/w/a/b', { task: '5', q: 'bug' }, null)).toBe('/w/a/b?q=bug');
  });

  it('resets the comments mode', () => {
    expect(taskPanelHref('/w/a/b', 'task=5&comments=all', 6)).toBe('/w/a/b?task=6');
  });

  it('keeps repeated params from a record', () => {
    expect(taskPanelHref('/w/a/b', { status: ['x', 'y'] }, 1)).toBe(
      '/w/a/b?status=x&status=y&task=1',
    );
  });
});

describe('taskPanelHref with a parent', () => {
  it('opens the create form for a subtask', () => {
    expect(taskPanelHref('/w/a/b', 'q=bug&task=5', 'new', { parent: 5 })).toBe(
      '/w/a/b?q=bug&task=new&parent=5',
    );
  });

  it('drops the parent when opening or closing a task', () => {
    expect(taskPanelHref('/w/a/b', 'task=new&parent=5', 9)).toBe('/w/a/b?task=9');
    expect(taskPanelHref('/w/a/b', 'task=new&parent=5', null)).toBe('/w/a/b');
  });

  it('ignores the parent for an existing task', () => {
    expect(taskPanelHref('/w/a/b', '', 9, { parent: 5 })).toBe('/w/a/b?task=9');
  });
});

describe('parseTaskParentParam', () => {
  it('parses a task number', () => {
    expect(parseTaskParentParam('12')).toBe(12);
    expect(parseTaskParentParam(['3', '4'])).toBe(3);
  });

  it.each([undefined, '', '0', 'abc', '1.5'])('ignores %j', (value) => {
    expect(parseTaskParentParam(value)).toBeNull();
  });
});

describe('newTaskPageHref', () => {
  it('builds the create page address with an optional parent', () => {
    expect(newTaskPageHref('acme')).toBe('/w/acme/tasks/new');
    expect(newTaskPageHref('acme', 12)).toBe('/w/acme/tasks/new?parent=12');
  });
});

describe('withSearchParam', () => {
  it('adds a param next to existing ones', () => {
    expect(withSearchParam('/w/a/b', 'task=5', 'comments', 'all')).toBe(
      '/w/a/b?task=5&comments=all',
    );
  });

  it('removes a param', () => {
    expect(withSearchParam('/w/a/b', 'comments=all', 'comments', null)).toBe('/w/a/b');
  });
});

describe('taskPageHref', () => {
  it('builds the full page address', () => {
    expect(taskPageHref('acme', 42)).toBe('/w/acme/tasks/42');
  });
});
