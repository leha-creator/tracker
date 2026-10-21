import { Callout } from '@/components/feedback/callout';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/users/user-avatar';
import type { AdminUserDetailDto } from '@/modules/admin/client';

import { UserActionsMenu } from '../user-actions-menu';

// Карточка рендерится на сервере: даты форматируются здесь, без расхождения часовых поясов.
const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'long' });
const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

/** Шапка карточки: аватар, имя, email, роль, статус, безопасность и меню действий. */
export function UserDetailHeader({ user }: { user: AdminUserDetailDto['user'] }) {
  const banned = user.ban.kind === 'banned';
  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-start gap-5">
        <UserAvatar user={{ name: user.name, image: user.image }} size="xl" />
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="text-xl font-semibold tracking-tight break-words">
            {user.name}
            {user.isCurrentUser && (
              <span className="text-base font-normal text-muted-foreground"> (вы)</span>
            )}
          </h2>
          <a
            href={`mailto:${user.email}`}
            className="w-fit text-sm break-all text-muted-foreground hover:underline"
          >
            {user.email}
          </a>
          {user.position && <p className="text-sm">{user.position}</p>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {user.role === 'admin' ? (
              <Badge variant="secondary">Администратор</Badge>
            ) : (
              <Badge variant="outline">Пользователь</Badge>
            )}
            {user.ban.kind === 'banned' && (
              <Badge variant="destructive">
                {user.ban.until
                  ? `Заблокирован до ${DATE_TIME.format(user.ban.until)}`
                  : 'Заблокирован бессрочно'}
              </Badge>
            )}
            {user.github && <Badge variant="outline">GitHub привязан</Badge>}
          </div>
        </div>
        {!user.isCurrentUser && (
          <UserActionsMenu
            variant="button"
            afterDeleteHref="/admin/users"
            user={{
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              banned,
            }}
          />
        )}
      </div>
      {user.ban.kind === 'banned' && user.ban.reason && (
        <Callout tone="destructive" title="Причина блокировки" icon={null}>
          <span className="break-words">{user.ban.reason}</span>
        </Callout>
      )}
      {user.bio && <p className="text-sm break-words whitespace-pre-wrap">{user.bio}</p>}
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Fact label="Зарегистрирован">{DATE.format(user.createdAt)}</Fact>
        <Fact label="Профиль изменён">{DATE_TIME.format(user.updatedAt)}</Fact>
        <Fact label="Пространств">{user.workspacesCount}</Fact>
        {user.github && <Fact label="GitHub id">{user.github.githubId}</Fact>}
      </dl>
    </header>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
