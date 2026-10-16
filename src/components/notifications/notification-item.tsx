'use client';

import Link from 'next/link';

import { UserAvatar } from '@/components/users/user-avatar';
import { cn } from '@/lib/utils';
import type { NotificationDto } from '@/modules/notifications/client';

/** Уведомление после JSON (Route Handler, Server Action): даты — строки ISO или Date. */
export type NotificationItemData = Omit<NotificationDto, 'createdAt' | 'readAt'> & {
  createdAt: string | Date;
  readAt: string | Date | null;
};

const RELATIVE = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
const DATE = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });

/** «5 минут назад», «вчера», дальше недели — дата. */
export function formatNotificationTime(value: string | Date, now = Date.now()): string {
  const date = new Date(value);
  const minutes = Math.round((date.getTime() - now) / 60_000);
  if (Math.abs(minutes) < 1) return 'только что';
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return RELATIVE.format(days, 'day');
  return DATE.format(date);
}

interface NotificationItemProps {
  notification: NotificationItemData;
  /** Клик по уведомлению: отметить прочитанным (переход — по ссылке). */
  onOpen: (notification: NotificationItemData) => void;
  compact?: boolean;
}

export function NotificationItem({ notification, onOpen, compact = false }: NotificationItemProps) {
  const unread = notification.readAt === null;
  const actor = notification.actor ?? {
    name: notification.actorName ?? 'Tasker',
    image: null,
  };
  const createdAt = new Date(notification.createdAt);

  return (
    <Link
      href={notification.href}
      onClick={() => onOpen(notification)}
      className={cn(
        'flex gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        unread && 'bg-primary/5',
      )}
    >
      <UserAvatar user={actor} size="sm" className="mt-0.5" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate', unread && 'font-medium')}>
            {notification.title}
          </span>
          <time
            dateTime={createdAt.toISOString()}
            className="shrink-0 text-xs text-muted-foreground"
            // Относительное время зависит от часов браузера — расхождение с сервером ожидаемо.
            suppressHydrationWarning
          >
            {formatNotificationTime(createdAt)}
          </time>
        </span>
        <span className="truncate text-muted-foreground">
          {notification.actorName && `${notification.actorName} · `}
          {notification.subject}
        </span>
        {notification.excerpt && (
          <span className={cn('text-muted-foreground', compact ? 'truncate' : 'line-clamp-2')}>
            «{notification.excerpt}»
          </span>
        )}
        {!compact && (
          <span className="text-xs text-muted-foreground">{notification.workspaceName}</span>
        )}
      </span>
      {unread && (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
          <span className="sr-only">Не прочитано</span>
        </span>
      )}
    </Link>
  );
}
