'use client';

import { MoreHorizontalIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  revokeUserSessionsAction,
  setUserRoleAction,
  startImpersonationAction,
  unbanUserAction,
} from '@/modules/admin/client';
import type { GlobalRole } from '@/shared/access/global-role';

import { BanUserDialog } from './ban-user-dialog';
import { DeleteUserDialog } from './delete-user-dialog';

type DialogKind = 'ban' | 'unban' | 'role' | 'sessions' | 'delete' | 'impersonate';

interface UserActionsMenuProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: GlobalRole;
    banned: boolean;
  };
  /** Куда уйти после удаления: со страницы карточки — к списку (сама карточка исчезнет). */
  afterDeleteHref?: string;
  /** Вид кнопки: значок в таблице или кнопка «Действия» в карточке. */
  variant?: 'icon' | 'button';
}

/**
 * Действия над пользователем. Диалоги рендерятся вне меню и управляются состоянием: иначе
 * закрытие меню размонтировало бы открытый диалог. Сервер проверяет права и правила сам —
 * скрытые пункты лишь подсказывают.
 */
export function UserActionsMenu({ user, afterDeleteHref, variant = 'icon' }: UserActionsMenuProps) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  // Новый ключ на каждое открытие — диалог не показывает ошибку прошлой попытки.
  const [dialogKey, setDialogKey] = useState(0);
  const isAdmin = user.role === 'admin';

  function open(kind: DialogKind) {
    setDialogKey((key) => key + 1);
    setDialog(kind);
  }

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) setDialog(null);
  }, []);

  const dialogProps = { open: true, onOpenChange };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === 'icon' ? (
            <Button variant="ghost" size="icon" aria-label={`Действия: ${user.name}`}>
              <MoreHorizontalIcon />
            </Button>
          ) : (
            <Button variant="outline">
              Действия
              <MoreHorizontalIcon />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {!isAdmin && !user.banned && (
            <>
              <DropdownMenuItem onSelect={() => open('impersonate')}>
                Войти от имени…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => open('role')}>
            {isAdmin ? 'Снять роль администратора' : 'Сделать администратором'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('sessions')}>
            Завершить все сессии
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isAdmin ? (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Чтобы заблокировать или удалить, сначала снимите роль администратора
            </DropdownMenuLabel>
          ) : (
            <>
              {user.banned ? (
                <DropdownMenuItem onSelect={() => open('unban')}>Разблокировать</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => open('ban')}>Заблокировать…</DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onSelect={() => open('delete')}>
                Удалить…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === 'ban' && <BanUserDialog key={dialogKey} user={user} {...dialogProps} />}
      {dialog === 'delete' && (
        <DeleteUserDialog
          key={dialogKey}
          user={user}
          afterDeleteHref={afterDeleteHref}
          {...dialogProps}
        />
      )}
      {dialog === 'impersonate' && (
        <ConfirmActionDialog
          key={dialogKey}
          {...dialogProps}
          action={startImpersonationAction}
          fields={{ userId: user.id }}
          title={`Войти от имени «${user.name}»?`}
          description="На час вы увидите Tasker глазами пользователя и сможете действовать в его пространствах. Действия попадут в журнал с пометкой «через администратора». Управление сессиями и токенами будет недоступно. Админка в этом режиме закрыта — вернитесь кнопкой в полосе сверху."
          confirmLabel="Войти от имени"
          confirmVariant="default"
        />
      )}
      {dialog === 'unban' && (
        <ConfirmActionDialog
          key={dialogKey}
          {...dialogProps}
          action={unbanUserAction}
          fields={{ userId: user.id }}
          title={`Разблокировать «${user.name}»?`}
          description="Пользователь снова сможет войти и работать в своих пространствах."
          confirmLabel="Разблокировать"
          confirmVariant="default"
        />
      )}
      {dialog === 'role' && (
        <ConfirmActionDialog
          key={dialogKey}
          {...dialogProps}
          action={setUserRoleAction}
          fields={{ userId: user.id, role: isAdmin ? 'user' : 'admin' }}
          title={
            isAdmin
              ? `Снять роль администратора с «${user.name}»?`
              : `Сделать «${user.name}» администратором?`
          }
          description={
            isAdmin
              ? 'Пользователь потеряет доступ к администрированию ресурса.'
              : 'Администратор управляет всеми пользователями ресурса: блокирует, удаляет, выдаёт роли.'
          }
          confirmLabel={isAdmin ? 'Снять роль' : 'Сделать администратором'}
          confirmVariant={isAdmin ? 'destructive' : 'default'}
        />
      )}
      {dialog === 'sessions' && (
        <ConfirmActionDialog
          key={dialogKey}
          {...dialogProps}
          action={revokeUserSessionsAction}
          fields={{ userId: user.id }}
          title={`Завершить все сессии «${user.name}»?`}
          description="Пользователь выйдет на всех устройствах и сможет войти снова."
          confirmLabel="Завершить сессии"
        />
      )}
    </>
  );
}
