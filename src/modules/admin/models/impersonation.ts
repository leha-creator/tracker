import { ForbiddenError, ValidationError } from '@/shared/errors';

import type { ManagedUser } from './admin-user';

/** Длительность входа от имени пользователя: час, потом сессия истекает сама. */
export const IMPERSONATION_SESSION_SECONDS = 60 * 60;

export interface ImpersonationTarget extends ManagedUser {
  isAgent: boolean;
  /** Заблокирован сейчас (истёкший бан не считается). */
  bannedNow: boolean;
}

/**
 * Войти от имени можно только обычного активного пользователя: не себя, не администратора
 * (иначе вход давал бы чужие права администратора), не агента (у него нет интерфейса) и не
 * заблокированного (сессию ему не выдаст плагин).
 */
export function assertCanImpersonate(actorId: string, target: ImpersonationTarget): void {
  if (actorId === target.id) {
    throw new ForbiddenError('Нельзя войти от имени своей учётной записи');
  }
  if (target.isAgent) {
    throw new ValidationError('Агент пространства не работает в интерфейсе');
  }
  if (target.role === 'admin') {
    throw new ValidationError('Нельзя войти от имени администратора: сначала снимите роль');
  }
  if (target.bannedNow) {
    throw new ValidationError('Пользователь заблокирован: сначала разблокируйте его');
  }
}
