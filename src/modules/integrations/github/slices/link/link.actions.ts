'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import { dismissPullRequestSchema, linkPullRequestSchema } from './link.schema';
import { dismissPullRequest, linkPullRequestByUrl } from './manual-link.service';

/** Задача видна на своей странице, в панелях доски и списка — обновляем всё пространство. */
function revalidateWorkspace(): void {
  revalidatePath('/w/[workspaceSlug]', 'layout');
}

export async function linkPullRequestByUrlAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = linkPullRequestSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await linkPullRequestByUrl(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'linkPullRequestByUrl' }),
      values: formValues(formData, ['url']),
    };
  }
}

export async function dismissPullRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = dismissPullRequestSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await dismissPullRequest(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'dismissPullRequest' }), values: {} };
  }
}
