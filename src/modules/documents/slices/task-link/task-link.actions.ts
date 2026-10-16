'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import type { LinkedDocumentDto, LinkedTaskDto } from './task-link.dto';
import {
  searchDocumentsForLinkSchema,
  searchTasksForLinkSchema,
  taskLinkSchema,
} from './task-link.schema';
import {
  linkDocumentToTask,
  searchDocumentsForLink,
  searchTasksForLink,
  unlinkDocumentFromTask,
} from './task-link.service';

/** Связь видна и в задаче (страница, панель на доске и в списках), и в документе. */
function revalidateLinks() {
  revalidatePath('/w/[workspaceSlug]', 'layout');
}

export async function searchDocumentsForLinkAction(
  raw: unknown,
): Promise<ActionResult<LinkedDocumentDto[]>> {
  try {
    const input = searchDocumentsForLinkSchema.parse(raw);
    const session = await requireUser();
    return { ok: true, data: await searchDocumentsForLink(session, input) };
  } catch (error) {
    return toActionError(error, { action: 'searchDocumentsForLink' });
  }
}

export async function searchTasksForLinkAction(
  raw: unknown,
): Promise<ActionResult<LinkedTaskDto[]>> {
  try {
    const input = searchTasksForLinkSchema.parse(raw);
    const session = await requireUser();
    return { ok: true, data: await searchTasksForLink(session, input) };
  } catch (error) {
    return toActionError(error, { action: 'searchTasksForLink' });
  }
}

export async function linkDocumentToTaskAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = taskLinkSchema.parse(raw);
    const session = await requireUser();
    await linkDocumentToTask(session, input);
    revalidateLinks();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'linkDocumentToTask' });
  }
}

export async function unlinkDocumentFromTaskAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = taskLinkSchema.parse(raw);
    const session = await requireUser();
    await unlinkDocumentFromTask(session, input);
    revalidateLinks();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'unlinkDocumentFromTask' });
  }
}
