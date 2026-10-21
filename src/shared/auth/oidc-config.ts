import type { GenericOAuthConfig } from 'better-auth/plugins/generic-oauth';

import { mapIdpProfile } from './oidc-profile';

/** providerId в tasker и meet: от него зависит callback `/api/auth/callback/plwedding` в IdP. */
export const OIDC_PROVIDER_ID = 'plwedding';
/** Куда IdP возвращает после выхода (post_logout_redirect_uri клиента в IdP). */
export const OIDC_POST_LOGOUT_PATH = '/login';

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

/** Настройки клиента из env (OIDC_* обязательны: вход — только через IdP). */
export function oidcSettingsFromEnv(env: {
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
}): OidcSettings {
  return {
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
  };
}

/** Страница аккаунта IdP: пароль, 2FA, сессии, фото. */
export function idpAccountUrl(issuer: string): string {
  return `${issuer}/account`;
}

/**
 * Провайдер genericOAuth для IdP plwedding ID (контракт — docs/oidc-clients.md в leha-creator/auth):
 * authorization code + PKCE S256, client_secret_basic, ID-токен RS256 с проверкой по JWKS
 * из discovery. Без подтверждённого email в IdP сессия не создаётся. Имя, email и фото
 * обновляются при каждом входе: источник правды — IdP.
 */
export function buildOidcProviderConfig(settings: OidcSettings): GenericOAuthConfig {
  return {
    providerId: OIDC_PROVIDER_ID,
    name: 'plwedding ID',
    discoveryUrl: `${settings.issuer}/.well-known/openid-configuration`,
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
    authentication: 'basic',
    scopes: ['openid', 'email', 'profile'],
    pkce: true,
    requireIdTokenVerification: true,
    requireEmailVerification: true,
    overrideUserInfo: true,
    postLogoutRedirectURI: OIDC_POST_LOGOUT_PATH,
    mapProfileToUser: (profile) => mapIdpProfile(profile, settings.issuer),
  };
}
