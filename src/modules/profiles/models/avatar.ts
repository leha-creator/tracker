import { isIdpAvatarPath } from '@/shared/auth/oidc-profile';

/** Робот агента пространства (как AGENT_AVATAR_PATH в модуле agents; profiles от agents не зависит). */
const AGENT_AVATAR_PATH = '/agent-avatar.svg';

/**
 * Адрес фото выдан приложением: фото из IdP (`/api/idp-avatar/…`) или робот агента. `User.image`
 * приходит из профиля IdP, поэтому чужие адреса (внешние трекеры) не показываем.
 */
export function isAvatarUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && (value === AGENT_AVATAR_PATH || isIdpAvatarPath(value));
}
