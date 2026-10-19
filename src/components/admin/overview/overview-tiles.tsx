import { Ban, Building2, KeyRound, ShieldAlert, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';

import { adminActivityHref } from '@/components/admin/activity/admin-activity-href';
import { cn } from '@/lib/utils';
import { SIGNUPS_PERIOD_DAYS, type ResourceOverviewDto } from '@/modules/admin/client';
import { EMPTY_ADMIN_AUDIT_QUERY } from '@/modules/audit/client';

interface Tile {
  key: string;
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  href?: string;
  /** Тревожное значение — цветом, только если оно не ноль. */
  alert?: boolean;
}

const TILE_CLASS =
  'grid h-full grid-cols-[minmax(0,1fr)] content-between gap-1 rounded-xl border bg-card p-4';

/** Счётчики ресурса: число — ссылка на отфильтрованный список, где он есть. */
export function OverviewTiles({ overview }: { overview: ResourceOverviewDto }) {
  const tiles: Tile[] = [
    {
      key: 'users',
      label: 'Пользователи',
      value: overview.users.total,
      hint: `Администраторов: ${overview.users.admins}, с 2FA: ${overview.users.twoFactor}, без подтверждённого email: ${overview.users.unverified}`,
      icon: Users,
      href: '/admin/users',
    },
    {
      key: 'banned',
      label: 'Заблокированы',
      value: overview.users.banned,
      hint: 'Блокировка действует сейчас',
      icon: Ban,
      href: '/admin/users?status=banned',
    },
    {
      key: 'signups',
      label: `Регистрации за ${SIGNUPS_PERIOD_DAYS} дней`,
      value: overview.signupsTotal,
      hint: 'Новые аккаунты людей (без агентов)',
      icon: UserPlus,
      href: adminActivityHref({ ...EMPTY_ADMIN_AUDIT_QUERY, kind: 'auth.signed_up' }),
    },
    {
      key: 'workspaces',
      label: 'Пространства',
      value: overview.workspaces.total,
      hint: `В архиве: ${overview.workspaces.archived}`,
      icon: Building2,
      href: '/admin/workspaces',
    },
    {
      key: 'sessions',
      label: 'Активные сессии',
      value: overview.sessions.active,
      hint: `Из них вход от имени пользователя: ${overview.sessions.impersonated}`,
      icon: KeyRound,
    },
    {
      key: 'failed',
      label: 'Неудачные входы за 24 ч',
      value: overview.failedSignIns24h,
      hint: 'Неверный пароль или код у существующих аккаунтов',
      icon: ShieldAlert,
      href: adminActivityHref({ ...EMPTY_ADMIN_AUDIT_QUERY, kind: 'auth.sign_in_failed' }),
      alert: true,
    },
  ];

  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="Сводка ресурса"
    >
      {tiles.map((tile) => {
        const alarming = tile.alert && tile.value > 0;
        const body = (
          <>
            <span className="flex items-start gap-1.5 text-sm leading-5 text-muted-foreground">
              <tile.icon
                aria-hidden
                className={cn('mt-0.5 size-4 shrink-0', alarming && 'text-destructive')}
              />
              <span className="min-w-0">{tile.label}</span>
            </span>
            <span
              className={cn(
                'text-3xl font-semibold tracking-tight tabular-nums',
                alarming && 'text-destructive',
              )}
            >
              {tile.value}
            </span>
          </>
        );
        return (
          <li key={tile.key} className="min-w-0">
            {tile.href ? (
              <Link
                href={tile.href}
                title={tile.hint}
                className={cn(
                  TILE_CLASS,
                  'transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                )}
              >
                {body}
              </Link>
            ) : (
              <div title={tile.hint} className={TILE_CLASS}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
