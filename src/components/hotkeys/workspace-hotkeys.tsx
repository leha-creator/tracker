'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';

import { taskPanelHref } from '@/components/tasks/task-panel/task-panel-href';
import { useHotkeys } from '@/lib/use-hotkeys';

import { SHORTCUTS } from './shortcuts';

/** Страницы, где есть панель задачи (`?task=`): доска, список проекта и задачи пространства. */
const TASK_PANEL_PAGE_RE = /^\/w\/[^/]+\/(?:tasks|projects\/[^/]+\/(?:board|list))$/;

/** Видимый элемент: скрытые (Activity) страницы остаются в DOM. */
function findVisible(selector: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>(selector);
  return [...elements].find((element) => element.checkVisibility()) ?? null;
}

/** Клавиши пространства: новая задача, поиск в списке, переходы по разделам. */
export function WorkspaceHotkeys() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const base = `/w/${workspaceSlug}`;

  useHotkeys([
    {
      keys: SHORTCUTS.newTask.keys,
      handler: () => {
        const page = TASK_PANEL_PAGE_RE.test(pathname) ? pathname : `${base}/tasks`;
        const search = page === pathname ? searchParams.toString() : '';
        router.push(taskPanelHref(page, search, 'new'), { scroll: false });
      },
    },
    {
      keys: SHORTCUTS.focusSearch.keys,
      // Без списка на странице клавиша ничего не делает.
      handler: () => findVisible('[data-list-search]')?.focus(),
    },
    { keys: SHORTCUTS.goOverview.keys, handler: () => router.push(`${base}/overview`) },
    { keys: SHORTCUTS.goProjects.keys, handler: () => router.push(base) },
    { keys: SHORTCUTS.goTasks.keys, handler: () => router.push(`${base}/tasks`) },
    { keys: SHORTCUTS.goDocs.keys, handler: () => router.push(`${base}/docs`) },
  ]);

  return null;
}
