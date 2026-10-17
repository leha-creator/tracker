import 'server-only';

import { getProject } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { isUniqueViolation } from '@/shared/db';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertCanCreateView,
  canonicalViewParams,
  normalizeViewName,
  type SavedTaskViewScope,
} from '../../models';
import type { SavedTaskViewDto } from './saved-view.dto';
import { savedViewRepository, type SavedViewTarget } from './saved-view.repository';

const log = createLogger('tasks.saved-view');

export interface SavedViewTargetInput {
  scope: SavedTaskViewScope;
  workspaceId?: string;
  projectId?: string;
}

function nameTaken(): ValidationError {
  const message = 'Фильтр с таким названием уже есть';
  return new ValidationError(message, { fieldErrors: { name: [message] } });
}

function viewNotFound(context: Record<string, unknown>): NotFoundError {
  log.warn(context, '[saved-view] not found');
  return new NotFoundError('Фильтр не найден');
}

/**
 * Проверяет доступ к области: пространство — участник, проект — ещё и принадлежит
 * пространству (`getProject` бросает `NotFoundError`). «Мои задачи» — только свои данные.
 */
async function resolveTarget(
  session: AuthSession,
  input: SavedViewTargetInput,
): Promise<SavedViewTarget> {
  if (input.scope === 'mine') return { scope: 'mine', workspaceId: null, projectId: null };
  if (!input.workspaceId) throw new ValidationError('Не указано пространство');
  await requireWorkspaceAccess(session, input.workspaceId);
  if (input.scope === 'workspace') {
    return { scope: 'workspace', workspaceId: input.workspaceId, projectId: null };
  }
  if (!input.projectId) throw new ValidationError('Не указан проект');
  try {
    await getProject(session, input.workspaceId, input.projectId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      log.warn(
        { userId: session.user.id, workspaceId: input.workspaceId, projectId: input.projectId },
        '[saved-view] project not in workspace',
      );
    }
    throw error;
  }
  return { scope: 'project', workspaceId: input.workspaceId, projectId: input.projectId };
}

/** Мои фильтры области в порядке создания. */
export async function listSavedViews(
  session: AuthSession,
  input: SavedViewTargetInput,
): Promise<SavedTaskViewDto[]> {
  const target = await resolveTarget(session, input);
  const rows = await savedViewRepository.list(session.user.id, target);
  log.debug({ userId: session.user.id, ...target, count: rows.length }, '[saved-view.list]');
  return rows;
}

export async function createSavedView(
  session: AuthSession,
  input: SavedViewTargetInput & { name: string; params: string },
): Promise<SavedTaskViewDto> {
  const userId = session.user.id;
  const target = await resolveTarget(session, input);
  const name = normalizeViewName(input.name);
  const params = canonicalViewParams(input.params, target.scope);

  const count = await savedViewRepository.count(userId, target);
  try {
    assertCanCreateView(count);
  } catch (error) {
    log.warn({ userId, ...target, count }, '[saved-view.create] limit reached');
    throw error;
  }
  if (await savedViewRepository.isNameTaken(userId, target, name)) {
    log.warn({ userId, ...target }, '[saved-view.create] name taken');
    throw nameTaken();
  }
  try {
    const row = await savedViewRepository.create({
      ...target,
      userId,
      name,
      params,
      position: count,
    });
    log.info(
      { userId, scope: target.scope, workspaceId: target.workspaceId, viewId: row.id },
      '[saved-view] created',
    );
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

export async function renameSavedView(
  session: AuthSession,
  input: { viewId: string; name: string },
): Promise<void> {
  const userId = session.user.id;
  const view = await savedViewRepository.findOwn(userId, input.viewId);
  if (!view) throw viewNotFound({ userId, viewId: input.viewId, op: 'rename' });
  const name = normalizeViewName(input.name);
  if (name === view.name) return;
  const target = { scope: view.scope, workspaceId: view.workspaceId, projectId: view.projectId };
  if (await savedViewRepository.isNameTaken(userId, target, name, view.id)) {
    log.warn({ userId, viewId: view.id }, '[saved-view.rename] name taken');
    throw nameTaken();
  }
  try {
    if (!(await savedViewRepository.rename(userId, view.id, name))) {
      throw viewNotFound({ userId, viewId: view.id, op: 'rename' });
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  log.info(
    { userId, scope: view.scope, workspaceId: view.workspaceId, viewId: view.id },
    '[saved-view] renamed',
  );
}

export async function deleteSavedView(
  session: AuthSession,
  input: { viewId: string },
): Promise<void> {
  const userId = session.user.id;
  if (!(await savedViewRepository.delete(userId, input.viewId))) {
    throw viewNotFound({ userId, viewId: input.viewId, op: 'delete' });
  }
  log.info({ userId, viewId: input.viewId }, '[saved-view] deleted');
}
