import { describe, expect, it } from 'vitest';

import {
  parseTaskPanelParam,
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
