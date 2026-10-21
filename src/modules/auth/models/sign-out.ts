/** Куда уйти после выхода, если выход в IdP не нужен или невозможен. */
export const LOCAL_SIGN_OUT_PATH = '/login';

/**
 * Адрес после выхода: end_session_endpoint IdP (выход и там, затем возврат на /login) или /login.
 * Под имперсонацией в IdP не уходим: там id_token_hint чужого пользователя, а сессия IdP —
 * администратора. Внешний адрес принимается только с origin IdP — открытого редиректа нет.
 */
export function resolveSignOutRedirect(input: {
  providerLogoutUrl: string | null | undefined;
  impersonating: boolean;
  issuer: string | undefined;
}): string {
  const { providerLogoutUrl, impersonating, issuer } = input;
  if (impersonating || !providerLogoutUrl || !issuer) return LOCAL_SIGN_OUT_PATH;
  try {
    return new URL(providerLogoutUrl).origin === issuer ? providerLogoutUrl : LOCAL_SIGN_OUT_PATH;
  } catch {
    return LOCAL_SIGN_OUT_PATH;
  }
}
