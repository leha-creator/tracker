import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

import { CommandPalette } from './command-palette';

/** Кнопка поиска в шапке и палитра Cmd/Ctrl+K. Читает сессию — рендерить внутри <Suspense>. */
export async function SearchTrigger() {
  const session = await requireUserOrRedirect();
  const workspaces = await listMyWorkspaces(session);
  return <CommandPalette workspaces={workspaces} />;
}
