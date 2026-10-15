import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

import { WorkspaceSwitcherMenu } from './workspace-switcher-menu';

/** Переключатель пространств в шапке. Читает сессию — рендерить внутри <Suspense>. */
export async function WorkspaceSwitcher() {
  const session = await requireUserOrRedirect();
  const workspaces = await listMyWorkspaces(session);
  return <WorkspaceSwitcherMenu items={workspaces} />;
}
