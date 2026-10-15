'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type ActionResult, type FormState } from '@/shared/types';

import {
  addToProjectSchema,
  changeStatusSchema,
  movePlacementSchema,
  removeFromProjectSchema,
} from './placement.schema';
import { addToProject, changeStatus, movePlacement, removeFromProject } from './placement.service';

/** Доски проектов и страница задачи — под layout пространства. */
function revalidateWorkspace() {
  revalidatePath('/w/[workspaceSlug]', 'layout');
}

export async function addToProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = addToProjectSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await addToProject(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'addToProject' }),
      values: formValues(formData, ['projectId', 'statusId']),
    };
  }
}

export async function changeStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = changeStatusSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await changeStatus(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'changeStatus' }), values: {} };
  }
}

export async function removeFromProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = removeFromProjectSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await removeFromProject(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'removeFromProject' }), values: {} };
  }
}

/** Перенос карточки на доске (drag-and-drop); вызывается из клиентского компонента без формы. */
export async function movePlacementAction(raw: {
  workspaceId: string;
  taskId: string;
  projectId: string;
  statusId: string;
  prevTaskId: string | null;
}): Promise<ActionResult<null>> {
  try {
    const input = movePlacementSchema.parse(raw);
    const session = await requireUser();
    await movePlacement(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'movePlacement' });
  }
}
