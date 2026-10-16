/** Состояние 2FA для профиля. */
export interface MyTwoFactorState {
  enabled: boolean;
  /** Есть ли пароль: без него 2FA недоступна (вход только через GitHub). */
  hasPassword: boolean;
}

/** Секрет для приложения и резервные коды — показываются один раз и нигде не сохраняются. */
export interface TwoFactorSetup {
  totpURI: string;
  backupCodes: string[];
}
