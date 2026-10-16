'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import type { DocumentUploadDto } from './file.dto';
import { documentUploadKeySchema, requestDocumentUploadSchema } from './file.schema';
import {
  cancelDocumentUpload,
  completeDocumentUpload,
  requestDocumentUpload,
} from './file.service';

function revalidateDocuments() {
  revalidatePath('/w/[workspaceSlug]/docs', 'layout');
}

/** Слот загрузки: браузер отправит файл прямо в хранилище по выданной форме. */
export async function requestDocumentUploadAction(
  raw: unknown,
): Promise<ActionResult<DocumentUploadDto>> {
  try {
    const input = requestDocumentUploadSchema.parse(raw);
    const session = await requireUser();
    return { ok: true, data: await requestDocumentUpload(session, input) };
  } catch (error) {
    return toActionError(error, { action: 'requestDocumentUpload' });
  }
}

export async function completeDocumentUploadAction(
  raw: unknown,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const key = documentUploadKeySchema.parse(raw);
    const session = await requireUser();
    const result = await completeDocumentUpload(session, key);
    revalidateDocuments();
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error, { action: 'completeDocumentUpload' });
  }
}

export async function cancelDocumentUploadAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const key = documentUploadKeySchema.parse(raw);
    const session = await requireUser();
    await cancelDocumentUpload(session, key);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'cancelDocumentUpload' });
  }
}
