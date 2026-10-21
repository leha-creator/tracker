'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import { createSubtasksSchema } from './action-items.schema';
import { createSubtasksFromActionItems } from './action-items.service';

/** «Создать подзадачи» из поручений конспекта встречи. */
export async function createSubtasksFromActionItemsAction(
  raw: unknown,
): Promise<ActionResult<{ created: number }>> {
  try {
    const input = createSubtasksSchema.parse(raw);
    const session = await requireUser();
    const result = await createSubtasksFromActionItems(session, input);
    // Подзадачи видны на странице задачи, в панелях доски и списка.
    revalidatePath('/w/[workspaceSlug]', 'layout');
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error, { action: 'createSubtasksFromActionItems' });
  }
}
