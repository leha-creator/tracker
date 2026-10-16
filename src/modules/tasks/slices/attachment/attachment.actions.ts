'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult, FormState } from '@/shared/types';

import type { AttachmentTarget } from '../../models/task-attachment';
import type { AttachmentUploadDto } from './attachment.dto';
import {
  completeUploadSchema,
  deleteAttachmentSchema,
  requestUploadSchema,
} from './attachment.schema';
import { completeUpload, deleteAttachment, requestUpload } from './attachment.service';

/** Вложения видны только на странице задачи. */
function revalidateTaskPage() {
  revalidatePath('/w/[workspaceSlug]/tasks/[taskNumber]', 'page');
}

/** Слот загрузки; вызывается из клиентского кода без формы. */
export async function requestAttachmentUploadAction(raw: {
  workspaceId: string;
  taskId: string;
  target: AttachmentTarget;
  fileName: string;
  size: number;
}): Promise<ActionResult<AttachmentUploadDto>> {
  try {
    const input = requestUploadSchema.parse(raw);
    const session = await requireUser();
    return { ok: true, data: await requestUpload(session, input) };
  } catch (error) {
    return toActionError(error, { action: 'requestAttachmentUpload' });
  }
}

/** Подтверждение после отправки файла в хранилище. Черновик комментария страницу не меняет. */
export async function completeAttachmentUploadAction(raw: {
  workspaceId: string;
  taskId: string;
  attachmentId: string;
}): Promise<ActionResult<null>> {
  try {
    const input = completeUploadSchema.parse(raw);
    const session = await requireUser();
    const { target } = await completeUpload(session, input);
    if (target === 'task') revalidateTaskPage();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'completeAttachmentUpload' });
  }
}

export async function deleteAttachmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = deleteAttachmentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await deleteAttachment(session, input);
    revalidateTaskPage();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteAttachment' }), values: {} };
  }
}
