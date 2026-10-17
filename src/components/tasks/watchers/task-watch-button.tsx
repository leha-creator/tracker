'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/users/user-avatar';
import { cn } from '@/lib/utils';
import { setWatchingAction, type TaskWatchersDto } from '@/modules/tasks/client';

interface TaskWatchButtonProps {
  workspaceId: string;
  taskId: string;
  currentUser: { userId: string; name: string; image: string | null };
  initial: TaskWatchersDto;
}

/**
 * «Следить / Вы следите» в тулбаре задачи: число наблюдателей, по клику — список и подписка.
 * Подписка меняется сразу (оптимистично), при ошибке возвращается.
 */
export function TaskWatchButton({
  workspaceId,
  taskId,
  currentUser,
  initial,
}: TaskWatchButtonProps) {
  const [state, setState] = useState(initial);
  const [synced, setSynced] = useState(initial);
  const [pending, startTransition] = useTransition();

  // Новые данные с сервера (подписка из комментария, назначение) — если не ждём своего ответа.
  if (initial !== synced && !pending) {
    setSynced(initial);
    setState(initial);
  }

  function toggle() {
    const previous = state;
    const watch = !state.watching;
    setState({
      watching: watch,
      watchers: watch
        ? [...state.watchers, currentUser]
        : state.watchers.filter((user) => user.userId !== currentUser.userId),
    });
    startTransition(async () => {
      const result = await setWatchingAction({ workspaceId, taskId, watch });
      if (!result.ok) {
        setState(previous);
        toast.error(result.error.message);
      }
    });
  }

  const count = state.watchers.length;
  const label = state.watching ? 'Вы следите' : 'Следить';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-hotkey-field="watch"
          aria-keyshortcuts="W"
          aria-label={`${label}. Наблюдателей: ${count}`}
          className={cn('gap-1.5 px-2', state.watching && 'text-primary')}
        >
          <Eye aria-hidden />
          <span className="max-sm:hidden">{label}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-64 gap-3 p-3">
        <p className="text-xs text-muted-foreground">
          Наблюдатели получают уведомления о комментариях и смене статуса.
        </p>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">Пока никто не следит.</p>
        ) : (
          <ul className="grid max-h-56 gap-1.5 overflow-y-auto" aria-label="Наблюдатели">
            {state.watchers.map((user) => (
              <li key={user.userId} className="flex min-w-0 items-center gap-2 text-sm">
                <UserAvatar user={{ name: user.name, image: user.image }} />
                <span className="truncate">
                  {user.name}
                  {user.userId === currentUser.userId && (
                    <span className="text-muted-foreground"> (вы)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          variant={state.watching ? 'outline' : 'default'}
          disabled={pending}
          onClick={toggle}
        >
          {state.watching ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {state.watching ? 'Перестать следить' : 'Следить за задачей'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
