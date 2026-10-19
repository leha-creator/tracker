import { SIGNUP_REJECTION_MESSAGES } from '@/shared/resource-settings/client';

/**
 * Текст ошибки входа через GitHub по коду из `?error=` (Better Auth добавляет его к
 * errorCallbackURL). Неизвестный код — общий текст: детали провайдера не показываем.
 */
export function githubSignInErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'account_not_linked':
      return 'Этот GitHub-аккаунт не привязан к Tasker. Войдите по email и паролю и привяжите GitHub в профиле.';
    case 'email_not_found':
    case 'email_not_verified':
      return 'GitHub не передал подтверждённый email. Подтвердите email в настройках GitHub или войдите по паролю.';
    case 'account_already_linked_to_different_user':
      return 'Этот GitHub-аккаунт уже привязан к другому пользователю Tasker.';
    // Отказ хука регистрации (настройки ресурса), см. shared/auth.
    case 'signup_closed':
      return SIGNUP_REJECTION_MESSAGES.closed;
    case 'signup_invite_only':
      return SIGNUP_REJECTION_MESSAGES.invite_only;
    case 'signup_domain':
      return SIGNUP_REJECTION_MESSAGES.domain;
    case 'banned':
    case 'user_banned':
      return 'Учётная запись заблокирована.';
    default:
      return 'Не удалось войти через GitHub. Попробуйте ещё раз.';
  }
}
