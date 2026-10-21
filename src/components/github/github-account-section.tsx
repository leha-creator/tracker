import { FormError } from '@/components/forms/form-field';
import { SettingsSection } from '@/components/layout/settings-section';
import { githubLinkErrorMessage } from '@/modules/auth';
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
  const error = errorCode ? githubLinkErrorMessage(errorCode) : null;

  return (
    <SettingsSection
      title="GitHub"
      description="Вход через GitHub, подключение репозиториев к пространству и уведомления о ревью ваших PR."
    >
      <div className="grid justify-items-start gap-3 text-sm">
        <FormError message={error ?? undefined} />
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
      </div>
    </SettingsSection>
  );
}
