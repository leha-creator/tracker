'use server';

import { revalidatePath } from 'next/cache';

import { toActionError } from '@/shared/errors';
import type { ActionResult, FormState } from '@/shared/types';

import { deleteGithubApp, startGithubAppManifest } from './app-setup.service';

/**
 * «Создать GitHub App»: адрес формы GitHub и манифест. Клиент отправляет манифест POST-ом
 * (GitHub принимает манифест только формой из браузера).
 */
export async function startGithubAppManifestAction(
  formData: FormData,
): Promise<ActionResult<{ formUrl: string; manifest: string }>> {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === 'string' ? value : '';
  };
  try {
    const data = await startGithubAppManifest({
      name: text('name'),
      owner: formData.get('owner') === 'organization' ? 'organization' : 'user',
      organization: text('organization'),
      isPublic: formData.get('isPublic') === 'on' ? 'true' : 'false',
    });
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, { action: 'startGithubAppManifest' });
  }
}

/** Отключить GitHub App, созданное в админке. */
export async function deleteGithubAppAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await deleteGithubApp();
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteGithubApp' }), values: {} };
  }
}
