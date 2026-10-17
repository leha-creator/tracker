'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { formValues, type FormState } from '@/shared/types';

import type { ProjectDto } from './project.dto';
import {
  archiveProjectSchema,
  createProjectSchema,
  deleteProjectSchema,
  updateProjectSchema,
} from './project.schema';
import {
  archiveProject,
  createProject,
  deleteProject,
  restoreProject,
  updateProject,
} from './project.service';

const log = createLogger('projects.actions');

/** Список проектов, шапка и вкладки — в layout пространства. */
function revalidateWorkspace() {
  revalidatePath('/w/[workspaceSlug]', 'layout');
}

export async function createProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let to: string;
  try {
    const input = createProjectSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const project = await createProject(session, input);
    to = `/w/${project.workspaceSlug}/projects/${project.id}/board`;
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createProject' }),
      values: formValues(formData, ['name', 'description', 'icon']),
    };
  }
  revalidateWorkspace();
  // redirect() бросает исключение — вызываем вне try/catch.
  log.debug({ to }, '[projects.actions.create] redirect');
  redirect(to);
}

export async function updateProjectAction(
  _prev: FormState<ProjectDto>,
  formData: FormData,
): Promise<FormState<ProjectDto>> {
  try {
    const input = updateProjectSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const project = await updateProject(session, input);
    revalidateWorkspace();
    return { ok: true, data: project };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateProject' }),
      values: formValues(formData, ['name', 'description', 'icon']),
    };
  }
}

export async function deleteProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let to: string;
  try {
    const input = deleteProjectSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const { workspaceSlug } = await deleteProject(session, input);
    to = `/w/${workspaceSlug}`;
  } catch (error) {
    return {
      ...toActionError(error, { action: 'deleteProject' }),
      values: formValues(formData, ['confirmName']),
    };
  }
  revalidateWorkspace();
  log.debug({ to }, '[projects.actions.delete] redirect');
  redirect(to);
}

/** В архив или из архива: страница проекта остаётся, меняется только режим «только чтение». */
async function setArchivedAction(
  formData: FormData,
  archive: boolean,
): Promise<FormState<ProjectDto>> {
  try {
    const input = archiveProjectSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const project = archive
      ? await archiveProject(session, input)
      : await restoreProject(session, input);
    revalidateWorkspace();
    return { ok: true, data: project };
  } catch (error) {
    return {
      ...toActionError(error, { action: archive ? 'archiveProject' : 'restoreProject' }),
      values: {},
    };
  }
}

export async function archiveProjectAction(
  _prev: FormState<ProjectDto>,
  formData: FormData,
): Promise<FormState<ProjectDto>> {
  return setArchivedAction(formData, true);
}

export async function restoreProjectAction(
  _prev: FormState<ProjectDto>,
  formData: FormData,
): Promise<FormState<ProjectDto>> {
  return setArchivedAction(formData, false);
}
