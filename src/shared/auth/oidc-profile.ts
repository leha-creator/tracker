// Чистые функции без server-only: адрес фото IdP проверяет и клиентский UserAvatar.

/** Адрес фото IdP в приложении: роут /api/idp-avatar перенаправляет на IdP. */
const IDP_AVATAR_PATH_PATTERN = /^\/api\/idp-avatar\/[\w-]+\?v=[\w-]+$/;
const SUB_PATTERN = /^[\w-]{1,128}$/;
const VERSION_PATTERN = /^[\w-]{1,128}$/;

export function idpAvatarPath(sub: string, version: string): string {
  return `/api/idp-avatar/${sub}?v=${version}`;
}

export function isIdpAvatarPath(value: string): boolean {
  return IDP_AVATAR_PATH_PATTERN.test(value);
}

/** Проверяет `sub` и `v` из адреса /api/idp-avatar: в адрес IdP попадают только безопасные символы. */
export function isValidIdpAvatarRef(sub: string, version: string): boolean {
  return SUB_PATTERN.test(sub) && VERSION_PATTERN.test(version);
}

/** Адрес фото на стороне IdP: `<issuer>/api/users/<sub>/avatar?v=<v>` (docs IdP, oidc-clients.md). */
export function idpAvatarSourceUrl(issuer: string, sub: string, version: string): string {
  return `${issuer}/api/users/${sub}/avatar?v=${version}`;
}

/**
 * Фото из claim `picture` → адрес приложения. Берётся только фото, загруженное в IdP
 * (`<issuer>/api/users/<sub>/avatar?v=…`) этого же пользователя; прочие адреса (аватар GitHub,
 * чужие хосты) — undefined: UserAvatar не грузит внешние картинки, остаются инициалы.
 */
export function mapIdpPicture(picture: unknown, sub: string, issuer: string): string | undefined {
  if (typeof picture !== 'string' || !isValidIdpAvatarRef(sub, 'x')) return undefined;
  let url: URL;
  try {
    url = new URL(picture);
  } catch {
    return undefined;
  }
  if (url.origin !== issuer || url.pathname !== `/api/users/${sub}/avatar`) return undefined;
  const version = url.searchParams.get('v');
  if (!version || !isValidIdpAvatarRef(sub, version)) return undefined;
  return idpAvatarPath(sub, version);
}

/** Пользователь tasker из claims ID-токена IdP. */
export type IdpMappedUser = {
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | undefined;
};

/**
 * Claims ID-токена (`sub`, `email`, `email_verified`, `name`, `picture`) → поля пользователя.
 * Имя без claim — часть email до `@`. `groups` не используется: роль admin в tasker локальная.
 */
export function mapIdpProfile(profile: Record<string, unknown>, issuer: string): IdpMappedUser {
  const sub =
    typeof profile.sub === 'string' || typeof profile.sub === 'number' ? String(profile.sub) : '';
  const email = typeof profile.email === 'string' ? profile.email.toLowerCase() : '';
  const name =
    typeof profile.name === 'string' && profile.name.trim() !== ''
      ? profile.name.trim()
      : email.split('@')[0] || 'Пользователь';
  return {
    name,
    email,
    emailVerified: profile.email_verified === true || profile.emailVerified === true,
    image: mapIdpPicture(profile.picture, sub, issuer),
  };
}
