import { describe, expect, it } from 'vitest';

import {
  currentWorkspaceSlug,
  getProjectTabs,
  getWorkspaceSections,
  type NavItem,
} from './nav-items';

function activeLabels(items: NavItem[], pathname: string): string[] {
  return items.filter((item) => item.isActive(pathname)).map((item) => item.label);
}

describe('currentWorkspaceSlug', () => {
  it('берёт slug из пути пространства', () => {
    expect(currentWorkspaceSlug('/w/studio')).toBe('studio');
    expect(currentWorkspaceSlug('/w/studio/projects/1/board')).toBe('studio');
  });

  it('вне пространства возвращает undefined', () => {
    expect(currentWorkspaceSlug('/')).toBeUndefined();
    expect(currentWorkspaceSlug('/admin/users')).toBeUndefined();
    expect(currentWorkspaceSlug('/workspaces/new')).toBeUndefined();
  });
});

describe('getWorkspaceSections', () => {
  const owner = getWorkspaceSections('a', 'owner');

  it('скрывает «Настройки» для участника', () => {
    expect(getWorkspaceSections('a', 'member').map((item) => item.label)).toEqual([
      'Обзор',
      'Проекты',
      'Задачи',
      'Документы',
      'Участники',
    ]);
    expect(owner.map((item) => item.label)).toContain('Настройки');
  });

  it.each([
    ['/w/a', ['Проекты']],
    ['/w/a/overview', ['Обзор']],
    ['/w/a/projects/new', ['Проекты']],
    ['/w/a/projects/p1/board', ['Проекты']],
    ['/w/a/tasks', ['Задачи']],
    ['/w/a/tasks/12', ['Задачи']],
    ['/w/a/docs', ['Документы']],
    ['/w/a/docs/d1/edit', ['Документы']],
    ['/w/a/settings/members', ['Участники']],
    ['/w/a/members/u1', ['Участники']],
    ['/w/a/settings', ['Настройки']],
    ['/w/a/settings/github', ['Настройки']],
    ['/w/a/settings/agents', ['Настройки']],
    ['/w/a/settings/labels', ['Настройки']],
    ['/w/a/settings/agents/agent-1', ['Настройки']],
  ])('на %s активен раздел %j', (pathname, expected) => {
    expect(activeLabels(owner, pathname)).toEqual(expected);
  });

  it('не путает пространства с общим префиксом', () => {
    expect(activeLabels(owner, '/w/ab')).toEqual([]);
    expect(activeLabels(owner, '/w/a/tasksx')).toEqual([]);
    expect(activeLabels(owner, '/w/a/docsx')).toEqual([]);
  });
});

describe('getProjectTabs', () => {
  const base = '/w/a/projects/p1';

  it('скрывает «Настройки» без права управления', () => {
    expect(getProjectTabs(base, false).map((tab) => tab.label)).toEqual(['Доска', 'Список']);
    expect(getProjectTabs(base, true).map((tab) => tab.label)).toEqual([
      'Доска',
      'Список',
      'Настройки',
    ]);
  });

  it('подсвечивает текущую вкладку', () => {
    const tabs = getProjectTabs(base, true);
    expect(activeLabels(tabs, `${base}/board`)).toEqual(['Доска']);
    expect(activeLabels(tabs, `${base}/list`)).toEqual(['Список']);
    expect(activeLabels(tabs, `${base}/settings`)).toEqual(['Настройки']);
  });
});
