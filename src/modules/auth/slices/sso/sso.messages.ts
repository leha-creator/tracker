/**
 * Текст ошибки привязки GitHub по коду из `?error=` (Better Auth добавляет его к
 * errorCallbackURL linkSocial). Неизвестный код — общий текст: детали провайдера не показываем.
 */
export function githubLinkErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'email_not_found':
    case 'email_not_verified':
      return 'GitHub не передал подтверждённый email. Подтвердите email в настройках GitHub.';
    case 'account_already_linked_to_different_user':
      return 'Этот GitHub-аккаунт уже привязан к другому пользователю Tasker.';
    default:
      return 'Не удалось привязать GitHub. Попробуйте ещё раз.';
  }
}

/** IdP не ответил на discovery: провайдер не подключён до следующей проверки (раз в 30 с). */
export const IDP_UNAVAILABLE_MESSAGE =
  'Вход через plwedding ID временно недоступен. Попробуйте через минуту.';

/**
 * Текст ошибки входа через IdP по коду из `?error=` (Better Auth добавляет его к errorCallbackURL
 * /login). Неизвестный код — общий текст: детали IdP не показываем.
 */
export function idpSignInErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'email_not_verified':
    case 'email_not_found':
      return 'Email в plwedding ID не подтверждён. Подтвердите его по ссылке из письма и войдите снова.';
    case 'account_not_linked':
    case 'unable_to_link_account':
      return 'Не удалось связать plwedding ID с учётной записью Tasker: её email не подтверждён. Обратитесь к администратору Tasker.';
    case 'account_already_linked_to_different_user':
      return 'Эта учётная запись plwedding ID уже связана с другим пользователем Tasker.';
    case 'access_denied':
      return 'Вход отменён.';
    case 'banned':
    case 'user_banned':
      return 'Учётная запись заблокирована.';
    default:
      return 'Не удалось войти через plwedding ID. Попробуйте ещё раз.';
  }
}
