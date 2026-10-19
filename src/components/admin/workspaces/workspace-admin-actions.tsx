'use client';

import { useActionState, useCallback, useEffect, useState, type ReactNode } from 'react';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { FormError, FormField } from '@/components/forms/form-field';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  archiveWorkspaceByAdminAction,
  deleteWorkspaceByAdminAction,
  restoreWorkspaceByAdminAction,
  setStorageQuotaByAdminAction,
  startImpersonationAction,
  transferOwnershipByAdminAction,
  WORKSPACE_QUOTA_MAX_MB,
} from '@/modules/admin/client';
import type { FormState } from '@/shared/types';

type DialogKind = 'archive' | 'restore' | 'delete' | 'transfer' | 'quota' | 'impersonate';

interface WorkspaceAdminActionsProps {
  workspace: { id: string; name: string; archived: boolean; storageQuotaMb: number | null };
  /** Кандидаты в владельцы: участники-люди, кроме владельцев (если не понижать — их выбирать незачем). */
  candidates: { userId: string; name: string; email: string; isOwner: boolean }[];
  /** Владелец, от имени которого можно войти; null — некого (нет владельца или это вы). */
  impersonationTarget: { userId: string; name: string } | null;
}

/** Действия администратора над пространством. Сервер проверяет правила сам. */
export function WorkspaceAdminActions({
  workspace,
  candidates,
  impersonationTarget,
}: WorkspaceAdminActionsProps) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const onOpenChange = useCallback((next: boolean) => {
    if (!next) setDialog(null);
  }, []);
  const dialogProps = { open: true, onOpenChange };

  function open(kind: DialogKind) {
    setDialogKey((key) => key + 1);
    setDialog(kind);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {impersonationTarget && (
        <Button type="button" variant="outline" size="sm" onClick={() => open('impersonate')}>
          Войти от имени владельца
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => open('transfer')}>
        Назначить владельца…
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => open('quota')}>
        Квота хранилища…
      </Button>
      {workspace.archived ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => open('restore')}>
            Восстановить
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => open('delete')}>
            Удалить навсегда…
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => open('archive')}>
          В архив
        </Button>
      )}

      {dialog === 'archive' && (
        <ConfirmActionDialog
          key={dialogKey}
          {...dialogProps}
          action={archiveWorkspaceByAdminAction}
          fields={{ workspaceId: workspace.id }}
          title={`Отправить «${workspace.name}» в архив?`}
          description="Пространство пропадёт у участников, из MCP, вебхуков GitHub и напоминаний. Восстановить его сможете вы или владелец."
          confirmLabel="В архив"
        />
      )}
      {dialog === 'restore' && (
        <ConfirmActionDialog
          key={dialogKey}
          {...dialogProps}
          action={restoreWorkspaceByAdminAction}
          fields={{ workspaceId: workspace.id }}
          title={`Восстановить «${workspace.name}»?`}
          description="Пространство снова станет доступно участникам."
          confirmLabel="Восстановить"
          confirmVariant="default"
        />
      )}
      {dialog === 'impersonate' && impersonationTarget && (
        <ConfirmActionDialog
          key={dialogKey}
          {...dialogProps}
          action={startImpersonationAction}
          fields={{ userId: impersonationTarget.userId }}
          title={`Войти от имени «${impersonationTarget.name}»?`}
          description="На час вы увидите Tasker глазами владельца. Действия попадут в журнал с пометкой «через администратора»; админка в этом режиме закрыта."
          confirmLabel="Войти от имени"
          confirmVariant="default"
        />
      )}
      {dialog === 'delete' && (
        <DeleteDialog key={dialogKey} workspace={workspace} onOpenChange={onOpenChange} />
      )}
      {dialog === 'transfer' && (
        <TransferDialog
          key={dialogKey}
          workspaceId={workspace.id}
          candidates={candidates}
          onOpenChange={onOpenChange}
        />
      )}
      {dialog === 'quota' && (
        <QuotaDialog key={dialogKey} workspace={workspace} onOpenChange={onOpenChange} />
      )}
    </div>
  );
}

/** Диалог с формой: закрывается после успешного ответа сервера. */
function FormDialog({
  action,
  title,
  description,
  submitLabel,
  submitVariant = 'default',
  canSubmit = true,
  onOpenChange,
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  title: string;
  description: ReactNode;
  submitLabel: string;
  submitVariant?: 'default' | 'destructive';
  canSubmit?: boolean;
  onOpenChange: (open: boolean) => void;
  children: (state: FormState) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const failure = state && !state.ok ? state : null;
  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {children(state)}
          <FormError message={failure?.error.fieldErrors ? undefined : failure?.error.message} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            <Button type="submit" variant={submitVariant} disabled={pending || !canSubmit}>
              {pending ? 'Подождите…' : submitLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function fieldErrors(state: FormState, field: string): string[] | undefined {
  return state && !state.ok ? state.error.fieldErrors?.[field] : undefined;
}

function DeleteDialog({
  workspace,
  onOpenChange,
}: {
  workspace: { id: string; name: string };
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmName, setConfirmName] = useState('');
  return (
    <FormDialog
      action={deleteWorkspaceByAdminAction}
      title={`Удалить «${workspace.name}» навсегда?`}
      description="Проекты, задачи, документы, участники, токены и интеграции пространства будут удалены. Отменить удаление нельзя."
      submitLabel="Удалить"
      submitVariant="destructive"
      canSubmit={confirmName.trim() === workspace.name}
      onOpenChange={onOpenChange}
    >
      {(state) => (
        <>
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <FormField
            name="confirmName"
            label={`Введите название пространства: ${workspace.name}`}
            autoComplete="off"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            errors={fieldErrors(state, 'confirmName')}
          />
        </>
      )}
    </FormDialog>
  );
}

function TransferDialog({
  workspaceId,
  candidates,
  onOpenChange,
}: {
  workspaceId: string;
  candidates: WorkspaceAdminActionsProps['candidates'];
  onOpenChange: (open: boolean) => void;
}) {
  const [userId, setUserId] = useState('');
  return (
    <FormDialog
      action={transferOwnershipByAdminAction}
      title="Назначить владельца"
      description="Новый владелец — участник-человек пространства. Прежние владельцы останутся владельцами, если не отметить флажок."
      submitLabel="Назначить"
      canSubmit={userId !== ''}
      onOpenChange={onOpenChange}
    >
      {() =>
        candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            В пространстве нет участников-людей, кроме владельцев.
          </p>
        ) : (
          <>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="userId" value={userId} />
            <div className="grid gap-2">
              <Label htmlFor="transfer-user">Участник</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="transfer-user" className="w-full">
                  <SelectValue placeholder="Выберите участника" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.userId} value={candidate.userId}>
                      {candidate.name} · {candidate.email}
                      {candidate.isOwner ? ' (владелец)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="transfer-demote" name="demotePreviousOwners" />
              <Label htmlFor="transfer-demote" className="leading-snug font-normal">
                Сделать прежних владельцев участниками
              </Label>
            </div>
          </>
        )
      }
    </FormDialog>
  );
}

function QuotaDialog({
  workspace,
  onOpenChange,
}: {
  workspace: { id: string; storageQuotaMb: number | null };
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormDialog
      action={setStorageQuotaByAdminAction}
      title="Квота хранилища документов"
      description="В мегабайтах. Пустое поле — квота по умолчанию ресурса; 0 закрывает загрузку файлов. Уже загруженные файлы не удаляются."
      submitLabel="Сохранить"
      onOpenChange={onOpenChange}
    >
      {(state) => (
        <>
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <FormField
            name="quotaMb"
            label="Квота, МБ"
            type="number"
            inputMode="numeric"
            min={0}
            max={WORKSPACE_QUOTA_MAX_MB}
            step={1}
            placeholder="По умолчанию"
            defaultValue={workspace.storageQuotaMb ?? ''}
            errors={fieldErrors(state, 'quotaMb')}
          />
        </>
      )}
    </FormDialog>
  );
}
