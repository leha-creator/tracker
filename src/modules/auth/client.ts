/**
 * Публичный API модуля для клиентских компонентов: Server Actions, чистые функции и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export { signInWithIdpAction } from './slices/sso/sso.actions';
export type { IdpSignInState } from './slices/sso/sso.actions';
export {
  revokeOtherSessionsAction,
  revokeSessionAction,
  signOutAction,
} from './slices/session/session.actions';
export type { MySessionDto } from './slices/session/session.dto';
export { describeUserAgent } from './models/user-agent';
export type { UserAgentInfo } from './models/user-agent';
