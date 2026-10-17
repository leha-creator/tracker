'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import { watchTaskSchema } from './watcher.schema';
import { setWatching } from './watcher.service';

/** «Следить» / «Не следить» за задачей. */
export async function setWatchingAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = watchTaskSchema.parse(raw);
    const session = await requireUser();
    await setWatching(session, input);
    revalidatePath('/w/[workspaceSlug]', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'setWatching' });
  }
}
