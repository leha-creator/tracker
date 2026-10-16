import { WorkspaceSections } from '@/components/layout/workspace-sections';
import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

import { WorkspaceSwitcherMenu } from './workspace-switcher-menu';

/**
 * Переключатель пространств и разделы текущего пространства в шапке. Возвращает два соседних
 * элемента flex-строки шапки. Читает сессию — рендерить внутри <Suspense>.
 */
export async function WorkspaceSwitcher() {
  const session = await requireUserOrRedirect();
  const workspaces = await listMyWorkspaces(session);
  return (
    <>
      <WorkspaceSwitcherMenu items={workspaces} />
      <WorkspaceSections
        items={workspaces}
        className="max-sm:order-last max-sm:basis-full max-sm:border-t sm:ml-5"
      />
    </>
  );
}
