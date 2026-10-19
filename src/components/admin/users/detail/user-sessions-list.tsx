import { MonitorSmartphoneIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { AdminUserSessionDto } from '@/modules/admin/client';

import { RevokeUserSessionButton } from './revoke-user-session-button';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

interface UserSessionsListProps {
  userId: string;
  sessions: AdminUserSessionDto[];
  /** Свою карточку администратор смотрит без кнопок: свои сессии — в профиле. */
  canRevoke: boolean;
}

/** Действующие сессии пользователя: устройство, IP, вход и активность. */
export function UserSessionsList({ userId, sessions, canRevoke }: UserSessionsListProps) {
  if (sessions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Активных сессий нет.
      </p>
    );
  }
  return (
    <ul className="grid divide-y rounded-xl border">
      {sessions.map((session) => (
        <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <MonitorSmartphoneIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{session.deviceLabel}</span>
              {session.impersonated && <Badge variant="secondary">Вход администратора</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
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
          {canRevoke && (
            <RevokeUserSessionButton
              userId={userId}
              sessionId={session.id}
              label={session.deviceLabel}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
