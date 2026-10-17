'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type ActionResult, type FormState } from '@/shared/types';

import type { TaskLabelDto, TaskLabelRefDto } from './label.dto';
import {
  createLabelSchema,
  deleteLabelSchema,
  setTaskLabelsSchema,
  updateLabelSchema,
} from './label.schema';
import { createLabel, deleteLabel, setTaskLabels, updateLabel } from './label.service';

/** Метки видны в задачах, на доске, в списках и в настройках — весь раздел пространства. */
function revalidateWorkspace() {
  revalidatePath('/w/[workspaceSlug]', 'layout');
}

/** Новая метка из выбора меток задачи (без формы). */
export async function createLabelAction(raw: unknown): Promise<ActionResult<TaskLabelDto>> {
  try {
    const input = createLabelSchema.parse(raw);
    const session = await requireUser();
    const label = await createLabel(session, input);
    revalidateWorkspace();
    return { ok: true, data: label };
  } catch (error) {
    return toActionError(error, { action: 'createLabel' });
  }
}

/** Новая метка из формы настроек. */
export async function createLabelFormAction(
  _prev: FormState<TaskLabelDto>,
  formData: FormData,
): Promise<FormState<TaskLabelDto>> {
  try {
    const input = createLabelSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const label = await createLabel(session, input);
    revalidateWorkspace();
    return { ok: true, data: label };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createLabel' }),
      values: formValues(formData, ['name', 'color']),
    };
  }
}

export async function updateLabelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = updateLabelSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await updateLabel(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateLabel' }),
      values: formValues(formData, ['name', 'color']),
    };
  }
}

/** Удаление метки — из диалога подтверждения. */
export async function deleteLabelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = deleteLabelSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await deleteLabel(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteLabel' }), values: {} };
  }
}

export async function setTaskLabelsAction(raw: unknown): Promise<ActionResult<TaskLabelRefDto[]>> {
  try {
    const input = setTaskLabelsSchema.parse(raw);
    const session = await requireUser();
    const labels = await setTaskLabels(session, input);
    revalidateWorkspace();
    return { ok: true, data: labels };
  } catch (error) {
    return toActionError(error, { action: 'setTaskLabels' });
  }
}
