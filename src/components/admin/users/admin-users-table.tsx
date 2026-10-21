import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminUserBanDto, AdminUserDto } from '@/modules/admin/client';

import { AdminUsersSortHeader } from './admin-users-sort-header';
import { UserActionsMenu } from './user-actions-menu';

// Таблица рендерится на сервере: даты форматируются здесь, без расхождения часовых поясов
// сервера и браузера при гидратации.
const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });
const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

/** Таблица пользователей ресурса. Сортируемые заголовки и меню действий — клиентские. */
export function AdminUsersTable({ items }: { items: AdminUserDto[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border transition-opacity group-data-pending/users:opacity-60">
      <Table>
        <TableHeader>
          <TableRow>
            <AdminUsersSortHeader sort="name" />
            <TableHead>Роль</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Пространства</TableHead>
            <AdminUsersSortHeader sort="created" />
            <TableHead className="w-12">
              <span className="sr-only">Действия</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="max-w-72">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {user.name}
                  </Link>
                  {user.isCurrentUser && <Badge variant="outline">Вы</Badge>}
                </div>
                <div className="truncate text-sm text-muted-foreground">{user.email}</div>
              </TableCell>
              <TableCell>
                {user.role === 'admin' ? (
                  <Badge variant="secondary">Администратор</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Пользователь</span>
                )}
              </TableCell>
              <TableCell className="max-w-64">
                <BanStatus ban={user.ban} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{user.workspacesCount}</TableCell>
              <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                <time dateTime={user.createdAt.toISOString()}>{DATE.format(user.createdAt)}</time>
              </TableCell>
              <TableCell>
                {!user.isCurrentUser && (
                  <UserActionsMenu
                    user={{
                      id: user.id,
                      name: user.name,
                      email: user.email,
                      role: user.role,
                      banned: user.ban.kind === 'banned',
                    }}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BanStatus({ ban }: { ban: AdminUserBanDto }) {
  if (ban.kind === 'active') {
    return <span className="text-sm text-muted-foreground">Активен</span>;
  }
  return (
    <div className="grid gap-0.5">
      <Badge variant="destructive" className="w-fit">
        {ban.until ? (
          <>
            Заблокирован до{' '}
            <time dateTime={ban.until.toISOString()}>{DATE_TIME.format(ban.until)}</time>
          </>
        ) : (
          'Заблокирован бессрочно'
        )}
      </Badge>
      {ban.reason && (
        <span title={ban.reason} className="truncate text-xs text-muted-foreground">
          {ban.reason}
        </span>
      )}
    </div>
  );
}
