import type { GlobalRole } from '@/shared/access/global-role';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors/app-error';

/** Правила управления пользователями ресурса. Чистый TS: без Prisma и Next.js. */

export const BAN_DURATIONS = ['forever', '1d', '7d', '30d'] as const;
export type BanDuration = (typeof BAN_DURATIONS)[number];

export const BAN_DURATION_LABELS: Record<BanDuration, string> = {
  forever: 'Бессрочно',
  '1d': '1 день',
  '7d': '7 дней',
  '30d': '30 дней',
};

export const BAN_REASON_MAX_LENGTH = 500;

const DAY_SECONDS = 60 * 60 * 24;

const BAN_DURATION_SECONDS: Record<BanDuration, number | undefined> = {
  forever: undefined,
  '1d': DAY_SECONDS,
  '7d': 7 * DAY_SECONDS,
  '30d': 30 * DAY_SECONDS,
};

/** Срок блокировки в секундах для плагина admin; `undefined` — бессрочно. */
export function banDurationToSeconds(duration: BanDuration): number | undefined {
  return BAN_DURATION_SECONDS[duration];
}

export type BanState = { kind: 'active' } | { kind: 'banned'; until: Date | null };

/**
 * Состояние блокировки на момент `now`. Истёкшая блокировка считается снятой: плагин
 * сбрасывает флаг только при следующем входе пользователя.
 */
export function resolveBanState(
  user: { banned: boolean | null; banExpires: Date | null },
  now: Date,
): BanState {
  if (!user.banned) return { kind: 'active' };
  if (user.banExpires && user.banExpires.getTime() <= now.getTime()) return { kind: 'active' };
  return { kind: 'banned', until: user.banExpires };
}

/** Пользователь, над которым администратор выполняет действие. */
export interface ManagedUser {
  id: string;
  role: GlobalRole;
}

/** Над собой действовать нельзя: так всегда остаётся хотя бы один администратор. */
export function assertCanManageUser(actorId: string, target: ManagedUser): void {
  if (actorId === target.id) {
    throw new ForbiddenError('Это действие нельзя выполнить над своей учётной записью');
  }
}

/** Администратора нельзя заблокировать: сначала снимите роль. */
export function assertCanBan(target: ManagedUser): void {
  if (target.role === 'admin') {
    throw new ValidationError('Сначала снимите роль администратора');
  }
}

/**
 * Нельзя удалить администратора и единственного владельца пространства: иначе пространство
 * останется без владельца.
 */
export function assertCanDelete(
  target: ManagedUser,
  soleOwnedWorkspaces: readonly { name: string }[],
): void {
  if (target.role === 'admin') {
    throw new ValidationError('Сначала снимите роль администратора');
  }
  if (soleOwnedWorkspaces.length > 0) {
    const names = soleOwnedWorkspaces.map((workspace) => `«${workspace.name}»`).join(', ');
    throw new ConflictError(
      `Пользователь — единственный владелец пространств: ${names}. ` +
        'Передайте владение другому участнику или заблокируйте пользователя.',
      { details: { workspacesCount: soleOwnedWorkspaces.length } },
    );
  }
}

export function assertRoleChange(target: ManagedUser, role: GlobalRole): void {
  if (target.role === role) {
    throw new ValidationError(
      role === 'admin' ? 'Пользователь уже администратор' : 'Пользователь уже не администратор',
    );
  }
}

/** Введённый email совпадает с email пользователя (без учёта регистра и пробелов по краям). */
export function isDeleteConfirmed(email: string, confirmEmail: string): boolean {
  return email.trim().toLowerCase() === confirmEmail.trim().toLowerCase();
}
