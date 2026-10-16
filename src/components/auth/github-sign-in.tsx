import { githubSignInErrorMessage } from '@/modules/auth';
import { isGithubEnabled } from '@/modules/integrations/github';

import { GithubSignInButton } from './github-sign-in-button';

/** Блок «или войдите через GitHub» под формой; без настроенного GitHub App — ничего. */
export function GithubSignIn({
  returnTo,
  errorCode,
  label,
}: {
  returnTo: string;
  errorCode?: string;
  label?: string;
}) {
  if (!isGithubEnabled()) return null;
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        или
        <span className="h-px flex-1 bg-border" />
      </div>
      <GithubSignInButton
        returnTo={returnTo}
        error={githubSignInErrorMessage(errorCode)}
        label={label}
      />
    </div>
  );
}
