'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { formValues, type ActionResult, type FormState } from '@/shared/types';

import type { TaskPageDto } from './task.dto';
import {
  createTaskSchema,
  deleteTaskSchema,
  listTasksSchema,
  updateTaskSchema,
} from './task.schema';
import { createTask, deleteTask, listTasks, updateTask } from './task.service';

const log = createLogger('tasks.actions');

const TASK_FIELDS = [
  'title',
  'description',
  'priority',
  'dueDate',
  'assigneeId',
  'projectId',
  'statusId',
] as const;

/** Доска, список задач и страница задачи — под layout пространства. */
function revalidateWorkspace() {
  revalidatePath('/w/[workspaceSlug]', 'layout');
}

/** Создание задачи из формы: после успеха — на страницу задачи. */
export async function createTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let to: string;
  try {
    const input = createTaskSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const task = await createTask(session, input);
    to = `/w/${task.workspaceSlug}/tasks/${task.number}`;
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createTask' }),
      values: formValues(formData, TASK_FIELDS),
    };
  }
  revalidateWorkspace();
  // redirect() бросает исключение — вызываем вне try/catch.
  log.debug({ to }, '[tasks.actions.create] redirect');
  redirect(to);
}

/** Быстрое создание в колонке доски: без перехода, доска обновится через revalidate. */
export async function quickCreateTaskAction(
  _prev: FormState<{ number: number }>,
  formData: FormData,
): Promise<FormState<{ number: number }>> {
  try {
    const input = createTaskSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const task = await createTask(session, input);
    revalidateWorkspace();
    return { ok: true, data: { number: task.number } };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'quickCreateTask' }),
      values: formValues(formData, ['title']),
    };
  }
}

export async function updateTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = updateTaskSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await updateTask(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateTask' }),
      values: formValues(formData, TASK_FIELDS),
    };
  }
}

export async function deleteTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let to: string;
  try {
    const input = deleteTaskSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const { workspaceSlug } = await deleteTask(session, input);
    to = `/w/${workspaceSlug}/tasks`;
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteTask' }), values: {} };
  }
  revalidateWorkspace();
  log.debug({ to }, '[tasks.actions.delete] redirect');
  redirect(to);
}

/** Следующая страница списка задач («Показать ещё»). */
export async function loadMoreTasksAction(raw: {
  workspaceId: string;
  cursor: string;
}): Promise<ActionResult<TaskPageDto>> {
  try {
    const input = listTasksSchema.parse(raw);
    const session = await requireUser();
    return { ok: true, data: await listTasks(session, input.workspaceId, input.cursor) };
  } catch (error) {
    return toActionError(error, { action: 'loadMoreTasks' });
  }
}
