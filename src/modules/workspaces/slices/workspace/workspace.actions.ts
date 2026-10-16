'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { formValues, type FormState } from '@/shared/types';

import type { WorkspaceSummaryDto } from './workspace.dto';
import {
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  renameWorkspaceSchema,
  updateTaskKeySchema,
} from './workspace.schema';
import {
  createWorkspace,
  deleteWorkspace,
  renameWorkspace,
  updateTaskKey,
} from './workspace.service';

const log = createLogger('workspaces.actions');

export async function createWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let slug: string;
  try {
    const input = createWorkspaceSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    ({ slug } = await createWorkspace(session, input));
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createWorkspace' }),
      values: formValues(formData, ['name', 'slug', 'taskKey', 'icon']),
    };
  }
  revalidatePath('/', 'layout');
  // redirect() бросает исключение — вызываем вне try/catch.
  log.debug({ to: `/w/${slug}` }, '[workspaces.actions.create] redirect');
  redirect(`/w/${slug}`);
}

export async function renameWorkspaceAction(
  _prev: FormState<WorkspaceSummaryDto>,
  formData: FormData,
): Promise<FormState<WorkspaceSummaryDto>> {
  try {
    const input = renameWorkspaceSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const workspace = await renameWorkspace(session, input);
    revalidatePath('/', 'layout');
    return { ok: true, data: workspace };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'renameWorkspace' }),
      values: formValues(formData, ['name', 'icon']),
    };
  }
}

export async function deleteWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = deleteWorkspaceSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await deleteWorkspace(session, input);
  } catch (error) {
    return {
      ...toActionError(error, { action: 'deleteWorkspace' }),
      values: formValues(formData, ['confirmName']),
    };
  }
  revalidatePath('/', 'layout');
  log.debug({ to: '/' }, '[workspaces.actions.delete] redirect');
  redirect('/');
}

export async function updateTaskKeyAction(
  _prev: FormState<{ taskKey: string }>,
  formData: FormData,
): Promise<FormState<{ taskKey: string }>> {
  try {
    const input = updateTaskKeySchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const result = await updateTaskKey(session, input);
    // Ключ виден в карточках, списке и задачах всего пространства.
    revalidatePath('/', 'layout');
    return { ok: true, data: result };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateTaskKey' }),
      values: formValues(formData, ['taskKey']),
    };
  }
}
