/** Репозиторий установки на странице настроек. Id GitHub — строкой. */
export interface GithubRepositoryDto {
  id: string;
  fullName: string;
  private: boolean;
  /** Выбран для пространства: его события привязываются к задачам. */
  enabled: boolean;
}

export interface GithubInstallationDto {
  id: string;
  accountLogin: string;
  /** "User" | "Organization". */
  accountType: string;
  suspended: boolean;
  /** Где на GitHub настроить доступ приложения к репозиториям. */
  configureUrl: string;
  repositories: GithubRepositoryDto[];
}

/** Установка, доступная пользователю на GitHub, но не подключённая к пространству. */
export interface AvailableInstallationDto {
  id: string;
  accountLogin: string;
  accountType: string;
}

export interface GithubSettingsDto {
  installations: GithubInstallationDto[];
  /**
   * Установки пользователя для подключения: null — GitHub не привязан к профилю или
   * не удалось получить список (см. `availableError`).
   */
  available: AvailableInstallationDto[] | null;
  githubLinked: boolean;
  /** Список доступных установок не загрузился (токен истёк, GitHub недоступен). */
  availableError: string | null;
}
