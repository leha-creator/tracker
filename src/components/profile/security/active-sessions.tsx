import { MonitorSmartphoneIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { MySessionDto } from '@/modules/auth/client';

import { RevokeOtherSessionsButton, RevokeSessionButton } from './session-actions';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

/** Активные сессии (серверный компонент: даты форматируются один раз, без расхождения поясов). */
export function ActiveSessions({ sessions }: { sessions: MySessionDto[] }) {
  const hasOthers = sessions.some((session) => !session.current);

  return (
    <div className="grid gap-4">
      <ul className="grid divide-y divide-foreground/[0.07]">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0"
          >
            <MonitorSmartphoneIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{session.deviceLabel}</span>
                {session.current && <Badge>Это устройство</Badge>}
                {session.impersonated && <Badge variant="secondary">Вход администратора</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {session.ipAddress ? `${session.ipAddress} · ` : ''}
                Вход:{' '}
                <time dateTime={session.createdAt.toISOString()}>
                  {DATE_TIME.format(session.createdAt)}
                </time>
                {' · '}
                Активность:{' '}
                <time dateTime={session.updatedAt.toISOString()}>
                  {DATE_TIME.format(session.updatedAt)}
                </time>
              </p>
            </div>
            {!session.current && (
              <RevokeSessionButton sessionId={session.id} label={session.deviceLabel} />
            )}
          </li>
        ))}
      </ul>
      {hasOthers && <RevokeOtherSessionsButton />}
      <p className="text-xs text-muted-foreground">
        Завершённая сессия может оставаться активной до 5 минут — столько живёт кеш сессии в
        браузере.
      </p>
    </div>
  );
}
