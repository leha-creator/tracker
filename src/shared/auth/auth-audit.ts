import type { SignInMethod } from '@/shared/audit/client';

/**
 * Способ входа по пути эндпоинта Better Auth, который создал сессию. Путь приходит в контексте
 * хука session.create.after; хук не знает, какой провайдер использовался, иначе как по пути.
 */
export function signInMethodFromPath(path: string | null | undefined): SignInMethod {
  if (!path) return 'other';
  if (path === '/sign-in/email' || path === '/sign-up/email') return 'password';
  if (path.startsWith('/callback/') || path.startsWith('/oauth2/callback/')) return 'github';
  if (path.startsWith('/two-factor/')) return 'two_factor';
  return 'other';
}

/** Способ регистрации по пути эндпоинта, создавшего пользователя. */
export function signUpMethodFromPath(path: string | null | undefined): 'email' | 'github' {
  return path?.startsWith('/callback/') || path?.startsWith('/oauth2/callback/')
    ? 'github'
    : 'email';
}
