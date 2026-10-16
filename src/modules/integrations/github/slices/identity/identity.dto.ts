/** GitHub-аккаунт текущего пользователя для профиля. */
export type MyGithubAccountDto =
  | { linked: false }
  | {
      linked: true;
      githubId: string;
      /** Логин GitHub; null — не удалось получить (токен истёк, GitHub недоступен). */
      login: string | null;
    };
