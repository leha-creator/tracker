'use client';

import { BellIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/modules/notifications/client';

import { NotificationItem, type NotificationItemData } from './notification-item';

/** Как часто обновлять счётчик, пока вкладка видима. */
const POLL_INTERVAL_MS = 60_000;

interface MenuData {
  items: NotificationItemData[];
  hasMore: boolean;
}

type LoadState = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; data: MenuData };

function formatCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Колокольчик: счётчик непрочитанных и последние уведомления (загружаются при открытии). */
export function NotificationBellMenu({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [unread, setUnread] = useState(initialUnreadCount);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

  const refreshCount = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json()) as { unreadCount: number };
      setUnread(body.unreadCount);
    } catch {
      // Сеть недоступна — оставляем прежнее значение до следующего опроса.
    }
  }, []);

  // Опрос только при видимой вкладке; при возврате на вкладку — сразу.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshCount();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshCount();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshCount]);

  async function load() {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as MenuData & { unreadCount: number };
      setUnread(body.unreadCount);
      setState({ status: 'ready', data: { items: body.items, hasMore: body.hasMore } });
    } catch {
      setState({ status: 'error' });
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
  }

  function markLocally(predicate: (item: NotificationItemData) => boolean) {
    const now = new Date().toISOString();
    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...current.data,
              items: current.data.items.map((item) =>
                item.readAt === null && predicate(item) ? { ...item, readAt: now } : item,
              ),
            },
          }
        : current,
    );
  }

  function handleItemOpen(item: NotificationItemData) {
    setOpen(false);
    if (item.readAt !== null) return;
    markLocally((entry) => entry.id === item.id);
    setUnread((count) => Math.max(0, count - 1));
    void markNotificationReadAction({ notificationId: item.id });
  }

  function markAll() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      markLocally(() => true);
      setUnread(0);
    });
  }

  const label = unread > 0 ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={label}
        className="relative grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground"
      >
        <BellIcon className="size-4" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums"
          >
            {formatCount(unread)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Уведомления</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unread === 0 || pending}
            onClick={markAll}
          >
            Прочитать все
          </Button>
        </div>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-1" aria-live="polite">
          {state.status === 'ready' ? (
            state.data.items.length > 0 ? (
              <ul className="grid gap-0.5">
                {state.data.items.map((item) => (
                  <li key={item.id}>
                    <NotificationItem notification={item} onOpen={handleItemOpen} compact />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Уведомлений пока нет
              </p>
            )
          ) : state.status === 'error' ? (
            <div className="grid justify-items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              Не удалось загрузить уведомления
              <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                Повторить
              </Button>
            </div>
          ) : (
            <div className="grid gap-1 p-1" aria-label="Загрузка">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          )}
        </div>
        <div className="border-t p-1">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-center text-sm font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Все уведомления
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
