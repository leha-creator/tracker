export { getAuth, isOidcSignInAvailable, SESSION_TTL_SECONDS } from './auth';
export type { Auth } from './auth';
export {
  idpAccountUrl,
  OIDC_POST_LOGOUT_PATH,
  OIDC_PROVIDER_ID,
  oidcSettingsFromEnv,
} from './oidc-config';
export { loadOidcDiscovery } from './oidc-discovery';
export { idpAvatarSourceUrl, isValidIdpAvatarRef } from './oidc-profile';
export { getFreshSession, getSession } from './session';
export type { AuthSession, AuthUser, AuthVia } from './session';
export { AGENT_EMAIL_DOMAIN, agentEmail, isAgentEmail } from './agent-identity';
