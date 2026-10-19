/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, чистые функции и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export {
  signInAction,
  signOutAction,
  signUpAction,
} from './slices/credentials/credentials.actions';
export type { AuthFormState } from './slices/credentials/credentials.actions';
export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './slices/credentials/credentials.schema';
export { signInWithGithubAction } from './slices/social/social.actions';
export type { SocialSignInState } from './slices/social/social.actions';
export { resendVerificationAction } from './slices/verification/verification.actions';
export type { ResendVerificationState } from './slices/verification/verification.actions';
export {
  changePasswordAction,
  forgotPasswordAction,
  resetPasswordAction,
} from './slices/password/password.actions';
export {
  confirmEnableTwoFactorAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
  startEnableTwoFactorAction,
  verifyTwoFactorSignInAction,
} from './slices/two-factor/two-factor.actions';
export type { MyTwoFactorState, TwoFactorSetup } from './slices/two-factor/two-factor.dto';
export { revokeOtherSessionsAction, revokeSessionAction } from './slices/session/session.actions';
export type { MySessionDto } from './slices/session/session.dto';
export { formatBackupCodesFile, formatTotpSecret, parseTotpUri } from './models';
export { describeUserAgent } from './models/user-agent';
export type { UserAgentInfo } from './models/user-agent';
