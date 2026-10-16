'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import type { ActionFailure, ActionResult } from '@/shared/types';

import { startGithubLink, unlinkGithub } from './identity.service';

const log = createLogger('github.identity.actions');

/** «Привязать GitHub»: редирект на авторизацию; после неё — /profile/account?github=linked. */
export async function linkGithubAccountAction(
  _prev: ActionFailure | null,
): Promise<ActionFailure | null> {
  let url: string;
  try {
    const session = await requireUser();
    url = await startGithubLink(session);
  } catch (error) {
    return toActionError(error, { action: 'linkGithubAccount' });
  }
  log.debug('[github.identity.actions.link] redirect to provider');
  redirect(url);
}

export async function unlinkGithubAccountAction(): Promise<ActionResult<null>> {
  try {
    const session = await requireUser();
    await unlinkGithub(session);
    revalidatePath('/profile/account');
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'unlinkGithubAccount' });
  }
}
