'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import { completeAvatarUploadSchema, requestAvatarUploadSchema } from './avatar.schema';
import { completeAvatarUpload, removeAvatar, requestAvatarUpload } from './avatar.service';

export interface AvatarUploadDto {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
}

/** Фото видно везде (шапка, задачи, комментарии) — перерисовываем всё приложение. */
function revalidateApp() {
  revalidatePath('/', 'layout');
}

export async function requestAvatarUploadAction(raw: {
  contentType: string;
  size: number;
}): Promise<ActionResult<AvatarUploadDto>> {
  try {
    const input = requestAvatarUploadSchema.parse(raw);
    const session = await requireUser();
    const data = await requestAvatarUpload(session, input);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, { action: 'requestAvatarUpload' });
  }
}

export async function completeAvatarUploadAction(raw: {
  uploadId: string;
  contentType: string;
}): Promise<ActionResult<{ image: string }>> {
  try {
    const input = completeAvatarUploadSchema.parse(raw);
    const session = await requireUser();
    const data = await completeAvatarUpload(session, input);
    revalidateApp();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, { action: 'completeAvatarUpload' });
  }
}

export async function removeAvatarAction(): Promise<ActionResult<null>> {
  try {
    const session = await requireUser();
    await removeAvatar(session);
    revalidateApp();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'removeAvatar' });
  }
}
