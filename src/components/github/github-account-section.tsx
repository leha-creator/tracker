import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { githubSignInErrorMessage } from '@/modules/auth';
import { getMyGithubAccount, isGithubEnabled } from '@/modules/integrations/github';
import type { AuthSession } from '@/shared/auth';

import { LinkGithubButton, UnlinkGithubButton } from './github-account-actions';

/**
 * Привязка GitHub в профиле: нужна для входа через GitHub, подключения установки GitHub App к
 * пространству и уведомлений о ревью своих PR. Без настроенного GitHub App — ничего.
 */
export async function GithubAccountSection({
  session,
  linked,
  errorCode,
}: {
  session: AuthSession;
  /** `?github=linked` после успешной привязки. */
  linked?: boolean;
  /** `?error=` после неудачной привязки. */
  errorCode?: string;
}) {
  if (!(await isGithubEnabled())) return null;
  const account = await getMyGithubAccount(session);
  const error = errorCode ? githubSignInErrorMessage(errorCode) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub</CardTitle>
        <CardDescription>
          Вход через GitHub, подключение репозиториев к пространству и уведомления о ревью ваших PR.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
            {error}
          </p>
        )}
        {account.linked ? (
          <>
            <p role={linked ? 'status' : undefined}>
              {linked ? 'GitHub привязан: ' : 'Привязан аккаунт '}
              {account.login ? (
                <a
                  href={`https://github.com/${account.login}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  @{account.login}
                </a>
              ) : (
                <span className="text-muted-foreground">
                  (логин недоступен — возможно, доступ истёк; привяжите заново)
                </span>
              )}
            </p>
            <UnlinkGithubButton />
          </>
        ) : (
          <>
            <p className="text-muted-foreground">GitHub не привязан.</p>
            <LinkGithubButton />
          </>
        )}
      </CardContent>
    </Card>
  );
}
