'use client';

import { KeyRoundIcon, PlusIcon } from 'lucide-react';
import { useActionState, useState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  API_TOKEN_EXPIRY_LABELS,
  API_TOKEN_EXPIRY_OPTIONS,
  API_TOKEN_NAME_MAX_LENGTH,
  buildClaudeMcpCommand,
  buildMcpJson,
  createAgentTokenAction,
  createApiTokenAction,
  TASKER_TOKEN_ENV,
  type CreatedApiTokenDto,
} from '@/modules/api-tokens/client';
import type { FormState } from '@/shared/types';

import { CodeSnippet } from './code-snippet';
import { ScopeFields } from './scope-fields';

/** Кому выпускается токен: себе (пространство выбирается) или агенту (пространство агента). */
export type ApiTokenTarget =
  | { kind: 'personal'; workspaces: { id: string; name: string }[] }
  | { kind: 'agent'; workspaceId: string; agentId: string; agentName: string };

interface CreateApiTokenDialogProps {
  target: ApiTokenTarget;
  /** Публичный адрес Tasker (BETTER_AUTH_URL) — из него строится адрес MCP-сервера. */
  baseUrl: string;
  disabled?: boolean;
}

/** Выпуск токена: форма, затем экран «скопируйте сейчас» с готовыми командами подключения. */
export function CreateApiTokenDialog({ target, baseUrl, disabled }: CreateApiTokenDialogProps) {
  const [open, setOpen] = useState(false);
  // Новый ключ — новая форма: после закрытия диалог открывается чистым, без прошлого токена.
  const [formKey, setFormKey] = useState(0);
  const noWorkspaces = target.kind === 'personal' && target.workspaces.length === 0;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setFormKey((key) => key + 1);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled || noWorkspaces}>
          <PlusIcon className="size-4" />
          Создать токен
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <CreateApiTokenForm
          key={formKey}
          target={target}
          baseUrl={baseUrl}
          onDone={() => handleOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateApiTokenForm({
  target,
  baseUrl,
  onDone,
}: CreateApiTokenDialogProps & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState<FormState<CreatedApiTokenDto>, FormData>(
    target.kind === 'agent' ? createAgentTokenAction : createApiTokenAction,
    null,
  );

  if (state?.ok) {
    return <CreatedTokenView created={state.data} baseUrl={baseUrl} onDone={onDone} />;
  }

  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {target.kind === 'agent'
            ? `Новый токен агента «${target.agentName}»`
            : 'Новый токен доступа'}
        </DialogTitle>
        <DialogDescription>
          {target.kind === 'agent'
            ? 'Claude Code с этим токеном действует от имени агента: задачи, комментарии и документы подписываются агентом. Админских прав у токена нет.'
            : 'Токен даёт агенту (например, Claude Code) доступ к одному пространству с вашими правами. Созданное через него помечается «через агента». Админских прав у токена нет.'}
        </DialogDescription>
      </DialogHeader>

      {target.kind === 'agent' && (
        <>
          <input type="hidden" name="workspaceId" value={target.workspaceId} />
          <input type="hidden" name="agentId" value={target.agentId} />
        </>
      )}

      <FormField
        name="name"
        label="Название"
        placeholder={target.kind === 'agent' ? 'Ноутбук Анны' : 'Claude Code — backend'}
        maxLength={API_TOKEN_NAME_MAX_LENGTH}
        defaultValue={failure?.values.name}
        errors={fieldErrors?.name}
        required
        autoFocus
      />

      <div className="grid gap-2 sm:grid-cols-2">
        {target.kind === 'personal' && (
          <div className="grid gap-2">
            <Label htmlFor="api-token-workspace">Пространство</Label>
            <Select
              name="workspaceId"
              defaultValue={failure?.values.workspaceId || target.workspaces[0]?.id}
            >
              <SelectTrigger
                id="api-token-workspace"
                className="w-full"
                aria-invalid={fieldErrors?.workspaceId ? true : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {target.workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors?.workspaceId && (
              <p className="text-sm text-destructive">{fieldErrors.workspaceId.join(' ')}</p>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="api-token-expiry">Срок действия</Label>
          <Select name="expiry" defaultValue={failure?.values.expiry || '90d'}>
            <SelectTrigger id="api-token-expiry" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {API_TOKEN_EXPIRY_OPTIONS.map((expiry) => (
                <SelectItem key={expiry} value={expiry}>
                  {API_TOKEN_EXPIRY_LABELS[expiry]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScopeFields />

      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? 'Создаём…' : 'Создать'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreatedTokenView({
  created,
  baseUrl,
  onDone,
}: {
  created: CreatedApiTokenDto;
  baseUrl: string;
  onDone: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-5" />
          Токен «{created.token.name}» создан
        </DialogTitle>
        <DialogDescription>
          Скопируйте токен сейчас: больше его не покажем. Пространство —{' '}
          {created.token.workspace.name}.
        </DialogDescription>
      </DialogHeader>

      <CodeSnippet label="Токен" value={created.secret} />
      <CodeSnippet
        label="Подключить Claude Code (выполнить в папке репозитория)"
        value={buildClaudeMcpCommand(baseUrl, created.secret)}
      />
      <CodeSnippet
        label={`Или .mcp.json в корне репозитория (токен — в переменной ${TASKER_TOKEN_ENV})`}
        value={buildMcpJson(baseUrl)}
      />

      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Готово
        </Button>
      </DialogFooter>
    </div>
  );
}
