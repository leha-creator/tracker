'use client';

import { ArchiveRestore } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import { Button } from '@/components/ui/button';
import { restoreWorkspaceAction, type WorkspaceListItemDto } from '@/modules/workspaces/client';

import { DeleteWorkspaceDialog } from './delete-workspace-dialog';

const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });

/** Архивные пространства владельца: «Восстановить» и «Удалить навсегда». */
export function ArchivedWorkspaces({ items }: { items: WorkspaceListItemDto[] }) {
  return (
    <section
      id="archived-workspaces"
      aria-labelledby="archived-workspaces-heading"
      className="grid scroll-mt-20 gap-3"
    >
      <h2 id="archived-workspaces-heading" className="text-base font-medium">
        Архивные пространства
      </h2>
      <ul className="grid divide-y rounded-xl border">
        {items.map((workspace) => (
          <li
            key={workspace.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm"
          >
            <EntityIconTile icon={workspace.icon} size="md" className="opacity-70" />
            <div className="grid min-w-0 flex-1 basis-40">
              <span className="truncate font-medium">{workspace.name}</span>
              {workspace.archivedAt && (
                <span className="text-xs text-muted-foreground">
                  в архиве с {DATE.format(workspace.archivedAt)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <RestoreWorkspaceButton workspaceId={workspace.id} />
              <DeleteWorkspaceDialog
                workspaceId={workspace.id}
                name={workspace.name}
                triggerSize="sm"
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Тост — сразу по ответу action, не в эффекте: после восстановления строка (и кнопка) пропадает
 * из списка архива вместе с состоянием компонента.
 */
function RestoreWorkspaceButton({ workspaceId }: { workspaceId: string }) {
  const [pending, startTransition] = useTransition();

  function restore() {
    const formData = new FormData();
    formData.set('workspaceId', workspaceId);
    startTransition(async () => {
      const result = await restoreWorkspaceAction(null, formData);
      if (result?.ok) toast.success(`Пространство «${result.data.name}» восстановлено`);
      else if (result) toast.error(result.error.message);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      onClick={restore}
    >
      <ArchiveRestore />
      Восстановить
    </Button>
  );
}
