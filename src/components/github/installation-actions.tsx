'use client';

import { startTransition, useActionState, useState } from 'react';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  connectInstallationAction,
  disconnectInstallationAction,
  setRepositoryEnabledAction,
  startInstallationAction,
} from '@/modules/integrations/github/client';
import type { FormState } from '@/shared/types';

/** «Установить GitHub App»: редирект на GitHub с подписанным state. */
export function InstallAppButton({
  workspaceId,
  workspaceSlug,
  disabled,
}: {
  workspaceId: string;
  workspaceSlug: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(startInstallationAction, null);
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <FormError message={state?.error.message} />
      <div>
        <Button type="submit" disabled={disabled || pending}>
          {pending ? 'Переходим на GitHub…' : 'Установить GitHub App'}
        </Button>
      </div>
    </form>
  );
}

/** Подключить установку, которая уже есть у пользователя на GitHub. */
export function ConnectInstallationButton({
  workspaceId,
  installationId,
}: {
  workspaceId: string;
  installationId: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    connectInstallationAction,
    null,
  );
  const error = state && !state.ok ? state.error.message : undefined;
  return (
    <form action={formAction} className="grid justify-items-end gap-1">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="installationId" value={installationId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? 'Подключаем…' : 'Подключить'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function DisconnectInstallationButton({
  workspaceId,
  installationId,
  accountLogin,
}: {
  workspaceId: string;
  installationId: string;
  accountLogin: string;
}) {
  return (
    <ConfirmActionDialog
      action={disconnectInstallationAction}
      fields={{ workspaceId, installationId }}
      trigger={
        <Button type="button" size="sm" variant="ghost">
          Отключить
        </Button>
      }
      title={`Отключить ${accountLogin}?`}
      description="Репозитории этой установки перестанут привязываться к задачам, а уже привязанные PR, ветки и коммиты исчезнут из задач. Приложение на GitHub останется установленным — удалить его можно в настройках GitHub."
      confirmLabel="Отключить"
    />
  );
}

/** Переключатель «использовать репозиторий в пространстве». */
export function RepositoryToggle({
  workspaceId,
  repositoryId,
  fullName,
  enabled,
}: {
  workspaceId: string;
  repositoryId: string;
  fullName: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setRepositoryEnabledAction,
    null,
  );
  const [requested, setRequested] = useState(enabled);
  const error = state && !state.ok ? state.error.message : undefined;

  function toggle(value: boolean) {
    const formData = new FormData();
    formData.set('workspaceId', workspaceId);
    formData.set('repositoryId', repositoryId);
    formData.set('enabled', String(value));
    setRequested(value);
    startTransition(() => action(formData));
  }

  return (
    <div className="grid justify-items-end gap-1">
      <Switch
        checked={pending ? requested : enabled}
        disabled={pending}
        onCheckedChange={toggle}
        aria-label={`Использовать ${fullName} в пространстве`}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
