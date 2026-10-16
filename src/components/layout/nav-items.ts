import type { WorkspaceRole } from '@/shared/access/workspace-role';

/** Пункт навигации: ссылка, подпись и признак активности для текущего пути. */
export interface NavItem {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

/** Slug текущего пространства из URL `/w/[workspaceSlug]/...`; вне пространства — undefined. */
export function currentWorkspaceSlug(pathname: string): string | undefined {
  const match = /^\/w\/([^/]+)/.exec(pathname);
  return match?.[1];
}

function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Разделы пространства. «Настройки» скрыты для участников ради UX — доступ проверяет страница.
 * «Проекты» активны и на странице пространства, и внутри проектов; «Настройки» — только на самой
 * странице настроек, а не в «Участниках», которые лежат под `/settings/members`.
 */
export function getWorkspaceSections(slug: string, role: WorkspaceRole): NavItem[] {
  const base = `/w/${slug}`;
  const sections: NavItem[] = [
    {
      href: base,
      label: 'Проекты',
      isActive: (path) => path === base || isWithin(path, `${base}/projects`),
    },
    { href: `${base}/tasks`, label: 'Задачи', isActive: (path) => isWithin(path, `${base}/tasks`) },
    {
      href: `${base}/settings/members`,
      label: 'Участники',
      isActive: (path) => isWithin(path, `${base}/settings/members`),
    },
  ];
  if (role === 'owner') {
    sections.push({
      href: `${base}/settings`,
      label: 'Настройки',
      isActive: (path) => path === `${base}/settings`,
    });
  }
  return sections;
}

/** Вкладки проекта. «Настройки» скрыты без права управления — доступ проверяет страница. */
export function getProjectTabs(basePath: string, canManage: boolean): NavItem[] {
  const tabs = [
    { href: `${basePath}/board`, label: 'Доска' },
    { href: `${basePath}/list`, label: 'Список' },
    ...(canManage ? [{ href: `${basePath}/settings`, label: 'Настройки' }] : []),
  ];
  return tabs.map((tab) => ({ ...tab, isActive: (path: string) => isWithin(path, tab.href) }));
}
