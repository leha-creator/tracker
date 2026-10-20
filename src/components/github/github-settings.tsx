import Link from 'next/link';

import { FormError } from '@/components/forms/form-field';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GithubSettingsDto } from '@/modules/integrations/github/client';

import {
  ConnectInstallationButton,
  DisconnectInstallationButton,
  InstallAppButton,
  RepositoryToggle,
} from './installation-actions';

/** Сообщения после возврата с GitHub (`?connected=1`, `?error=<код>` от Setup URL). */
const SETUP_ERRORS: Record<string, string> = {
  state: 'Ссылка установки устарела или открыта другим пользователем. Начните подключение заново.',
  forbidden:
    'Эта установка GitHub App вам недоступна. Проверьте, что вы вошли в нужный аккаунт GitHub.',
  failed: 'Не удалось подключить установку. Попробуйте ещё раз.',
};

export function GithubSettings({
  workspace,
  settings,
  connected,
  errorCode,
}: {
  workspace: { id: string; slug: string; taskKey: string | null };
  settings: GithubSettingsDto;
  connected?: boolean;
  errorCode?: string;
}) {
  const setupError = errorCode ? (SETUP_ERRORS[errorCode] ?? SETUP_ERRORS.failed) : null;
  const example = workspace.taskKey ? `${workspace.taskKey}-42` : null;

  return (
    <div className="grid gap-6">
      {connected && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          Установка подключена. Выберите репозитории, события которых привязываются к задачам.
        </p>
      )}
      <FormError message={setupError ?? undefined} />

      <Card>
        <CardHeader>
          <CardTitle>Как это работает</CardTitle>
          <CardDescription>
            {example ? (
              <>
                Укажите ключ задачи <code className="font-mono">{example}</code> в названии ветки,
                PR или в тексте коммита — PR, ветка и коммиты появятся в задаче, а статус PR будет
                виден на доске.
              </>
            ) : (
              <>
                У пространства нет ключа задач — задайте его в{' '}
                <Link href={`/w/${workspace.slug}/settings`} className="underline">
                  настройках
                </Link>
                , иначе ссылки на задачи не распознаются.
              </>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {!settings.githubLinked && (
        <Card>
          <CardHeader>
            <CardTitle>Привяжите GitHub</CardTitle>
            <CardDescription>
              Подключить установку может только владелец пространства с привязанным
              GitHub-аккаунтом: так мы проверяем, что установка действительно ваша.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/profile/account" className="text-sm text-primary hover:underline">
              Перейти в профиль
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Подключённые установки</CardTitle>
          <CardDescription>
            Установка GitHub App на личный аккаунт или организацию. События приходят только из
            выбранных здесь репозиториев.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {settings.installations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока ничего не подключено.</p>
          ) : (
            settings.installations.map((installation) => (
              <section
                key={installation.id}
                aria-label={installation.accountLogin}
                className="grid gap-3 rounded-lg border p-3"
              >
                <header className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{installation.accountLogin}</span>
                  <Badge variant="secondary">
                    {installation.accountType === 'Organization' ? 'Организация' : 'Аккаунт'}
                  </Badge>
                  {installation.suspended && <Badge variant="destructive">Приостановлена</Badge>}
                  <span className="ml-auto flex items-center gap-1">
                    <a
                      href={installation.configureUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 text-sm text-primary hover:underline"
                    >
                      Доступ на GitHub
                    </a>
                    <DisconnectInstallationButton
                      workspaceId={workspace.id}
                      installationId={installation.id}
                      accountLogin={installation.accountLogin}
                    />
                  </span>
                </header>
                {installation.repositories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    У приложения нет доступа ни к одному репозиторию — откройте «Доступ на GitHub».
                  </p>
                ) : (
                  <ul className="grid divide-y">
                    {installation.repositories.map((repository) => (
                      <li key={repository.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-mono">
                          {repository.fullName}
                        </span>
                        {repository.private && <Badge variant="outline">приватный</Badge>}
                        <RepositoryToggle
                          workspaceId={workspace.id}
                          repositoryId={repository.id}
                          fullName={repository.fullName}
                          enabled={repository.enabled}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Добавить установку</CardTitle>
          <CardDescription>
            Установите приложение на аккаунт или организацию GitHub — или подключите уже
            установленное.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {settings.availableError && (
            <p role="alert" className="text-sm text-destructive">
              {settings.availableError}
            </p>
          )}
          {settings.available && settings.available.length > 0 && (
            <ul className="grid divide-y">
              {settings.available.map((installation) => (
                <li key={installation.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {installation.accountLogin}
                  </span>
                  <ConnectInstallationButton
                    workspaceId={workspace.id}
                    installationId={installation.id}
                  />
                </li>
              ))}
            </ul>
          )}
          <InstallAppButton
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            disabled={!settings.githubLinked}
          />
        </CardContent>
      </Card>
    </div>
  );
}
