'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  loadMoreNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationPageDto,
} from '@/modules/notifications/client';

import { NotificationItem, type NotificationItemData } from './notification-item';

interface NotificationFeedProps {
  initial: NotificationPageDto;
  unreadOnly: boolean;
}

/** Лента уведомлений: «Показать ещё» по курсору, отметка прочитанного по клику. */
export function NotificationFeed({ initial, unreadOnly }: NotificationFeedProps) {
  const [items, setItems] = useState<NotificationItemData[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, startLoading] = useTransition();
  const [marking, startMarking] = useTransition();
  const hasUnread = items.some((item) => item.readAt === null);

  function markLocally(predicate: (item: NotificationItemData) => boolean) {
    const now = new Date();
    setItems((current) =>
      current.map((item) =>
        item.readAt === null && predicate(item) ? { ...item, readAt: now } : item,
      ),
    );
  }

  function handleOpen(item: NotificationItemData) {
    if (item.readAt !== null) return;
    markLocally((entry) => entry.id === item.id);
    void markNotificationReadAction({ notificationId: item.id });
  }

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      const result = await loadMoreNotificationsAction({ cursor, unreadOnly });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setItems((current) => [...current, ...result.data.items]);
      setCursor(result.data.nextCursor);
    });
  }

  function markAll() {
    startMarking(async () => {
      const result = await markAllNotificationsReadAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      markLocally(() => true);
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        {unreadOnly ? 'Непрочитанных уведомлений нет' : 'Уведомлений пока нет'}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasUnread || marking}
          onClick={markAll}
        >
          Прочитать все
        </Button>
      </div>
      <ul className="grid gap-1 rounded-xl border p-1">
        {items.map((item) => (
          <li key={item.id}>
            <NotificationItem notification={item} onOpen={handleOpen} />
          </li>
        ))}
      </ul>
      {cursor && (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-center"
          disabled={loading}
          onClick={loadMore}
        >
          {loading ? 'Загружаем…' : 'Показать ещё'}
        </Button>
      )}
    </div>
  );
}
