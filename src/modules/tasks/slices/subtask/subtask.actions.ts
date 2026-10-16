'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import type { TaskParentOptionDto } from './subtask.dto';
import { searchParentSchema, setTaskParentSchema } from './subtask.schema';
import { searchParentCandidates, setTaskParent } from './subtask.service';

/** Доска, списки и страница задачи — под layout пространства. */
function revalidateWorkspace() {
  revalidatePath('/w/[workspaceSlug]', 'layout');
}

/**
 * Смена родителя задачи (выбор в свойствах задачи или «Отвязать» в списке подзадач);
 * `parentId: null` или пусто — задача верхнего уровня.
 */
export async function setTaskParentAction(raw: {
  workspaceId: string;
  taskId: string;
  parentId: string | null;
}): Promise<ActionResult<null>> {
  try {
    const input = setTaskParentSchema.parse(raw);
    const session = await requireUser();
    await setTaskParent(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'setTaskParent' });
  }
}

/** Поиск кандидатов в родители для выбора в свойствах задачи (без изменения данных). */
export async function searchParentCandidatesAction(raw: {
  workspaceId: string;
  taskId: string;
  q: string;
}): Promise<ActionResult<TaskParentOptionDto[]>> {
  try {
    const input = searchParentSchema.parse(raw);
    const session = await requireUser();
    return { ok: true, data: await searchParentCandidates(session, input) };
  } catch (error) {
    return toActionError(error, { action: 'searchParentCandidates' });
  }
}
