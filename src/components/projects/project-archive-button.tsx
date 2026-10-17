'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  archiveProjectAction,
  restoreProjectAction,
  type ProjectDto,
} from '@/modules/projects/client';
import type { FormState } from '@/shared/types';

/** «В архив» / «Восстановить» проекта: действие обратимо, без подтверждения; ошибка — тостом. */
export function ProjectArchiveButton({
  workspaceId,
  projectId,
  archived,
}: {
  workspaceId: string;
  projectId: string;
  /** Проект уже в архиве — кнопка восстанавливает. */
  archived: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState<ProjectDto>, FormData>(
    archived ? restoreProjectAction : archiveProjectAction,
    null,
  );

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.data.archivedAt ? 'Проект в архиве' : 'Проект восстановлен');
    } else {
      toast.error(state.error.message);
    }
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? 'Восстановить проект' : 'Отправить в архив'}
      </Button>
    </form>
  );
}
