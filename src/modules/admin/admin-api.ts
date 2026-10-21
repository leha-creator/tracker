import 'server-only';

import { headers } from 'next/headers';

import { getAuth, type Auth } from '@/shared/auth';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import {
  findIdpSubject,
  getIdpAccountState,
  runIdpAdminAction,
  type IdpAccountState,
  type IdpAdminAction,
} from '@/shared/idp';
import { createLogger } from '@/shared/logger';

import { mapAdminError, mapIdpAdminError } from './admin.errors';

const log = createLogger('admin.idp');

/**
 * Вызов API плагина admin от имени текущего администратора (заголовки запроса с cookie).
 * Меняет только локальное состояние tasker (сессии, бан, роль). Ошибки плагина — доменные.
 */
export async function callAdminApi<T>(
  call: (api: Auth['api'], requestHeaders: Headers) => Promise<T>,
): Promise<T> {
  const requestHeaders = await headers();
  try {
    return await call(getAuth().api, requestHeaders);
  } catch (error) {
    throw mapAdminError(error);
  }
}

/** `sub` администратора и пользователя в IdP — для Admin API. */
export interface IdpSubjects {
  actor: string;
  target: string;
}

/**
 * `sub` обоих участников операции. Пользователь без связи с IdP (ещё не входил через plwedding ID
 * и не перенесён) — ValidationError: IdP о нём не знает.
 */
export async function resolveIdpSubjects(actorId: string, userId: string): Promise<IdpSubjects> {
  const [actor, target] = await Promise.all([findIdpSubject(actorId), findIdpSubject(userId)]);
  if (!actor) {
    log.warn({ actorId }, '[admin.idp] actor is not linked to IdP');
    throw new ForbiddenError(
      'Войдите в Tasker через plwedding ID, чтобы управлять учётными записями',
    );
  }
  if (!target) {
    log.warn({ actorId, userId }, '[admin.idp] user is not linked to IdP');
    throw new ValidationError(
      'Пользователь ещё не связан с plwedding ID: действие станет доступно после его входа',
    );
  }
  return { actor, target };
}

/** Действие Admin API IdP над учётной записью. Ошибки IdP — доменные. */
export async function callIdpAdmin(subjects: IdpSubjects, action: IdpAdminAction): Promise<void> {
  try {
    await runIdpAdminAction(subjects.target, subjects.actor, action);
  } catch (error) {
    throw mapIdpAdminError(error);
  }
}

/**
 * Состояние учётной записи в IdP для карточки. null — нет связи с IdP или IdP недоступен:
 * карточка показывается без него.
 */
export async function loadIdpAccountState(
  actorId: string,
  userId: string,
): Promise<IdpAccountState | null> {
  const [actor, target] = await Promise.all([findIdpSubject(actorId), findIdpSubject(userId)]);
  if (!actor || !target) return null;
  try {
    return await getIdpAccountState(target, actor);
  } catch (error) {
    log.warn(
      { userId, reason: error instanceof Error ? error.message : String(error) },
      '[admin.idp] account state unavailable',
    );
    return null;
  }
}
