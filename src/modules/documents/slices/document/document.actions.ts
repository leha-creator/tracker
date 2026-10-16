'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { formValues, type ActionResult, type FormState } from '@/shared/types';

import { linkDocumentToTask } from '../task-link/task-link.service';
import type { NoteSavedDto } from './document.dto';
import {
  createNoteSchema,
  deleteDocumentSchema,
  moveDocumentSchema,
  renameDocumentSchema,
  updateNoteSchema,
} from './document.schema';
import {
  createNote,
  deleteDocument,
  moveDocument,
  renameDocument,
  updateNote,
} from './document.service';

const log = createLogger('documents.actions');

/** Раздел «Документы»: дерево, списки и страницы документов. */
function revalidateDocuments() {
  revalidatePath('/w/[workspaceSlug]/docs', 'layout');
}

export async function createNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let to: string;
  try {
    const { linkTaskId, ...input } = createNoteSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const note = await createNote(session, input);
    if (linkTaskId) {
      // Заметка уже создана: сбой привязки не теряет текст — пользователь привяжет вручную.
      try {
        await linkDocumentToTask(session, {
          workspaceId: input.workspaceId,
          taskId: linkTaskId,
          documentId: note.id,
        });
      } catch (error) {
        log.warn(
          { err: error, documentId: note.id, taskId: linkTaskId },
          '[documents.actions.createNote] link to task failed',
        );
      }
    }
    to = `/w/${note.workspaceSlug}/docs/${note.id}`;
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createNote' }),
      values: formValues(formData, ['title', 'content', 'folderId']),
    };
  }
  // Привязка к задаче видна и в задаче (панель на доске и в списках) — обновляем всё пространство.
  if (formData.get('linkTaskId')) revalidatePath('/w/[workspaceSlug]', 'layout');
  else revalidateDocuments();
  // redirect() бросает исключение — вызываем вне try/catch.
  log.debug({ to }, '[documents.actions.createNote] redirect');
  redirect(to);
}

/** Сохранение из редактора (кнопка и Ctrl+S): новая версия или ошибка CONFLICT. */
export async function updateNoteAction(raw: unknown): Promise<ActionResult<NoteSavedDto>> {
  try {
    const input = updateNoteSchema.parse(raw);
    const session = await requireUser();
    const saved = await updateNote(session, input);
    revalidateDocuments();
    return { ok: true, data: saved };
  } catch (error) {
    return toActionError(error, { action: 'updateNote' });
  }
}

export async function renameDocumentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = renameDocumentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await renameDocument(session, input);
    revalidateDocuments();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'renameDocument' }),
      values: formValues(formData, ['title']),
    };
  }
}

export async function moveDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = moveDocumentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await moveDocument(session, input);
    revalidateDocuments();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'moveDocument' }),
      values: formValues(formData, ['folderId']),
    };
  }
}

export async function deleteDocumentAction(
  _prev: FormState<{ folderId: string | null }>,
  formData: FormData,
): Promise<FormState<{ folderId: string | null }>> {
  try {
    const input = deleteDocumentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const result = await deleteDocument(session, input);
    revalidateDocuments();
    return { ok: true, data: result };
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteDocument' }), values: {} };
  }
}
