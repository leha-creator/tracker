'use client';

import { useRef, useState, useTransition } from 'react';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { FormError, FormField } from '@/components/forms/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  deleteGithubAppAction,
  startGithubAppManifestAction,
  type GithubAppSetupDto,
} from '@/modules/integrations/github/client';
import type { ActionError } from '@/shared/types';

const ERROR_MESSAGES: Record<string, string> = {
  state: 'Ссылка устарела или начата другим администратором. Начните создание заново.',
  forbidden: 'Недостаточно прав.',
  conflict: 'GitHub App уже задан переменными окружения GITHUB_*.',
  failed: 'Не удалось получить ключи приложения от GitHub. Попробуйте ещё раз.',
};

interface GithubAppSetupProps {
  setup: GithubAppSetupDto;
  created: boolean;
  errorCode?: string;
}

/** GitHub App Tasker: создание по манифесту (в пару кликов на GitHub), сведения и отключение. */
export function GithubAppSetup({ setup, created, errorCode }: GithubAppSetupProps) {
  const queryError = errorCode ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.failed) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub</CardTitle>
        <CardDescription>
          Одно приложение GitHub на весь Tasker. Когда оно создано, владельцы пространств сами
          устанавливают его на свои аккаунты и организации и выбирают репозитории — в настройках
          пространства.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {created && (
          <p
            role="status"
            className="rounded-md bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-400"
          >
            GitHub App создан. Владельцы пространств уже могут подключать репозитории.
          </p>
        )}
        <FormError message={queryError} />
        {setup.source === 'env' && (
          <p className="text-muted-foreground">
            GitHub App задан переменными окружения <code>GITHUB_*</code> на сервере. Чтобы управлять
            им отсюда, уберите эти переменные.
          </p>
        )}
        {setup.source === 'db' && setup.app && <ConfiguredApp app={setup.app} />}
        {setup.source === null && <CreateAppForm setup={setup} />}
      </CardContent>
    </Card>
  );
}

function ConfiguredApp({ app }: { app: NonNullable<GithubAppSetupDto['app']> }) {
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">Приложение</dt>
        <dd>
          <a
            href={app.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            {app.name}
          </a>
        </dd>
        {app.ownerLogin && (
          <>
            <dt className="text-muted-foreground">Владелец на GitHub</dt>
            <dd>{app.ownerLogin}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Вебхук</dt>
        <dd>
          {app.webhookActive ? (
            <Badge variant="secondary">включён</Badge>
          ) : (
            <span className="text-muted-foreground">
              выключен: адрес Tasker недоступен из интернета, PR и коммиты не будут приходить
              автоматически
            </span>
          )}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <ConfirmActionDialog
          action={deleteGithubAppAction}
          fields={{}}
          trigger={
            <Button variant="outline" size="sm" className="text-destructive">
              Отключить
            </Button>
          }
          title="Отключить GitHub App?"
          description="Tasker забудет ключи приложения: привязка PR, вход через GitHub и подключение репозиториев перестанут работать. Само приложение на GitHub останется — удалите его там при необходимости."
          confirmLabel="Отключить"
        />
      </div>
    </div>
  );
}

function CreateAppForm({ setup }: { setup: GithubAppSetupDto }) {
  const [owner, setOwner] = useState<'user' | 'organization'>('user');
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const githubForm = useRef<HTMLFormElement>(null);
  const manifestField = useRef<HTMLInputElement>(null);
  const defaultName = `Tasker ${new URL(setup.baseUrl).host}`.slice(0, 34);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await startGithubAppManifestAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // GitHub принимает манифест только POST-формой из браузера.
      const form = githubForm.current;
      if (!form || !manifestField.current) return;
      form.action = result.data.formUrl;
      manifestField.current.value = result.data.manifest;
      form.submit();
    });
  }

  return (
    <div className="grid gap-4">
      {setup.local && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
          Tasker открыт по адресу {setup.baseUrl}, GitHub до него не достучится. Приложение будет
          создано без вебхука: подключение репозиториев и ручная привязка PR работают, а новые PR и
          коммиты автоматически не появятся.
        </p>
      )}
      <form action={submit} className="grid gap-4">
        <FormField
          name="name"
          label="Название приложения"
          defaultValue={defaultName}
          maxLength={34}
          required
          errors={error?.fieldErrors?.name}
        />
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Где создать приложение</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="owner"
              value="user"
              checked={owner === 'user'}
              onChange={() => setOwner('user')}
            />
            В моём личном аккаунте GitHub
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="owner"
              value="organization"
              checked={owner === 'organization'}
              onChange={() => setOwner('organization')}
            />
            В организации
          </label>
        </fieldset>
        {owner === 'organization' && (
          <FormField
            name="organization"
            label="Логин организации на GitHub"
            placeholder="my-company"
            required
            errors={error?.fieldErrors?.organization}
          />
        )}
        <div className="flex items-start gap-2">
          <Checkbox id="isPublic" name="isPublic" defaultChecked />
          <div className="grid gap-1">
            <Label htmlFor="isPublic">Разрешить установку любым аккаунтам</Label>
            <p className="text-muted-foreground">
              Иначе владельцы пространств смогут подключить только репозитории владельца приложения.
            </p>
          </div>
        </div>
        <FormError message={error && !error.fieldErrors ? error.message : undefined} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Готовим…' : 'Создать GitHub App на GitHub'}
          </Button>
        </div>
        <p className="text-muted-foreground">
          GitHub покажет готовое приложение со всеми адресами и правами — останется нажать «Create
          GitHub App». Ключи сохранятся в Tasker автоматически.
        </p>
      </form>
      {/* Отдельная форма: отправляется на github.com после подготовки манифеста. */}
      <form ref={githubForm} method="post" className="hidden">
        <input ref={manifestField} type="hidden" name="manifest" />
      </form>
    </div>
  );
}
