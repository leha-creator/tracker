'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import type { ActionFailure, FormState } from '@/shared/types';

import { installationRefSchema, repositoryToggleSchema } from './installation.schema';
import {
  connectInstallation,
  disconnectInstallation,
  setRepositoryEnabled,
  startInstallation,
} from './installation.service';

const log = createLogger('github.installation.actions');

const SETTINGS_PAGE = '/w/[workspaceSlug]/settings/github';

const startSchema = z.object({
  workspaceId: z.string().min(1),
  workspaceSlug: z.string().regex(/^[a-z0-9-]{1,64}$/),
});

/** «Установить GitHub App»: редирект на GitHub; вернёт на /api/integrations/github/setup. */
export async function startInstallationAction(
  _prev: ActionFailure | null,
  formData: FormData,
): Promise<ActionFailure | null> {
  let url: string;
  try {
    const input = startSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    url = await startInstallation(session, input);
  } catch (error) {
    return toActionError(error, { action: 'startGithubInstallation' });
  }
  log.debug('[github.installation.actions.start] redirect to GitHub');
  redirect(url);
}

/** Подключить установку, уже доступную пользователю на GitHub. */
export async function connectInstallationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = installationRefSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await connectInstallation(session, input);
    revalidatePath(SETTINGS_PAGE, 'page');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'connectGithubInstallation' }), values: {} };
  }
}

export async function disconnectInstallationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = installationRefSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await disconnectInstallation(session, input);
    // Связи задач удалены — страницы задач и доски пространства тоже.
    revalidatePath('/w/[workspaceSlug]', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'disconnectGithubInstallation' }), values: {} };
  }
}

export async function setRepositoryEnabledAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = repositoryToggleSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await setRepositoryEnabled(session, input);
    // Выключение удаляет связи задач с репозиторием — обновляем всё пространство.
    revalidatePath('/w/[workspaceSlug]', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'setGithubRepositoryEnabled' }), values: {} };
  }
}
