// Чистые правила регистрации без server-only кода: для модулей, форм и клиентских компонентов.
export {
  checkSignup,
  emailDomain,
  SIGNUP_MODE_LABELS,
  SIGNUP_MODES,
  SIGNUP_REJECTION_MESSAGES,
} from './signup-policy';
export type { SignupMode, SignupRejection } from './signup-policy';
