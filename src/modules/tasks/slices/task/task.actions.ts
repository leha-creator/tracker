'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { formValues, type FormState } from '@/shared/types';

import { parseReturnPath, withTaskPanel } from './task-redirect';
import { createTaskSchema, deleteTaskSchema, updateTaskSchema } from './task.schema';
import { createTask, deleteTask, updateTask } from './task.service';

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

/**
 * Адрес возврата из скрытого поля `returnTo` (панель задачи поверх доски или списка).
 * Непрошедший проверку адрес не используется — вызывающий код уходит на запасной.
 */
function readReturnPath(formData: FormData, workspaceSlug: string, action: string): string | null {
  const raw = formData.get('returnTo');
  if (raw === null || raw === '') return null;
  const path = parseReturnPath(raw, workspaceSlug);
  if (path === null) {
    const returnTo = typeof raw === 'string' ? raw.slice(0, 200) : '[file]';
    log.warn({ action, workspaceSlug, returnTo }, '[tasks.actions] returnTo rejected');
  }
  return path;
}

/** Создание задачи из формы: после успеха — в панель задачи (`returnTo`) или на страницу задачи. */
export async function createTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let to: string;
  try {
    const input = createTaskSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const task = await createTask(session, input);
    const returnPath = readReturnPath(formData, task.workspaceSlug, 'createTask');
    to = returnPath
      ? withTaskPanel(returnPath, task.number)
      : `/w/${task.workspaceSlug}/tasks/${task.number}`;
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
    // Из панели — на ту же страницу с закрытой панелью, со страницы задачи — в список.
    const returnPath = readReturnPath(formData, workspaceSlug, 'deleteTask');
    to = returnPath ? withTaskPanel(returnPath, null) : `/w/${workspaceSlug}/tasks`;
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteTask' }), values: {} };
  }
  revalidateWorkspace();
  log.debug({ to }, '[tasks.actions.delete] redirect');
  redirect(to);
}
