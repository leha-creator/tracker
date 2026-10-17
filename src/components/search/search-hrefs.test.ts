import { describe, expect, it } from 'vitest';

import { documentHref, memberHref, paletteTaskHref } from './search-hrefs';

describe('paletteTaskHref', () => {
  it('на доске открывает панель поверх доски', () => {
    expect(paletteTaskHref('/w/acme/projects/p1/board', '', 'acme', 42)).toBe(
      '/w/acme/projects/p1/board?task=42',
    );
  });

  it('в списке задач сохраняет фильтры', () => {
    expect(paletteTaskHref('/w/acme/tasks', 'assignee=me&task=3', 'acme', 42)).toBe(
      '/w/acme/tasks?assignee=me&task=42',
    );
  });

  it('на странице без панели ведёт в «Задачи» пространства', () => {
    expect(paletteTaskHref('/w/acme/docs', 'folder=x', 'acme', 42)).toBe('/w/acme/tasks?task=42');
    expect(paletteTaskHref('/w/acme/tasks/7', '', 'acme', 42)).toBe('/w/acme/tasks?task=42');
  });

  it('новая задача', () => {
    expect(paletteTaskHref('/w/acme/projects/p1/list', '', 'acme', 'new')).toBe(
      '/w/acme/projects/p1/list?task=new',
    );
    expect(paletteTaskHref('/w/acme', '', 'acme', 'new')).toBe('/w/acme/tasks?task=new');
  });
});

describe('ссылки результатов', () => {
  it('документ и участник', () => {
    expect(documentHref('acme', 'd1')).toBe('/w/acme/docs/d1');
    expect(memberHref('acme', 'u1')).toBe('/w/acme/members/u1');
  });
});
