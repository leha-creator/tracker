/** GitHub App Tasker для админки — без секретов. */
export interface GithubAppSetupDto {
  /** `env` — переменные GITHUB_* (менять на сервере), `db` — создано в админке, null — нет. */
  source: 'env' | 'db' | null;
  /** Публичный адрес Tasker (BETTER_AUTH_URL): из него строятся адреса в манифесте. */
  baseUrl: string;
  /** Адрес недоступен GitHub (localhost): приложение создаётся без вебхука. */
  local: boolean;
  app: {
    appId: number;
    name: string;
    slug: string;
    htmlUrl: string;
    /** Права и события приложения на GitHub. */
    settingsUrl: string;
    ownerLogin: string | null;
    webhookActive: boolean;
    createdAt: string;
  } | null;
}
