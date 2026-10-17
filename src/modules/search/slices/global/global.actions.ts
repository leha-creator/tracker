'use server';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import type { GlobalSearchResultDto } from './global.dto';
import { globalSearchSchema } from './global.schema';
import { globalSearch } from './global.service';

/** Поиск палитры Cmd+K (без изменения данных). */
export async function globalSearchAction(raw: {
  workspaceId: string | null;
  q: string;
}): Promise<ActionResult<GlobalSearchResultDto>> {
  try {
    const input = globalSearchSchema.parse(raw);
    const session = await requireUser();
    return { ok: true, data: await globalSearch(session, input) };
  } catch (error) {
    return toActionError(error, { action: 'globalSearch' });
  }
}
