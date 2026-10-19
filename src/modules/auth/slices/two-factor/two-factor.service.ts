import 'server-only';

import { cookies, headers } from 'next/headers';

import { requireNotImpersonating, requireUser } from '@/shared/access';
import { auditRequestContext, recordAuditEvent } from '@/shared/audit';
import { getAuth } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { enforceRateLimit, getClientIp } from '@/shared/rate-limit';

import { authErrorCode, mapAuthError } from '../credentials/credentials.errors';
import type { MyTwoFactorState, TwoFactorSetup } from './two-factor.dto';
import { twoFactorRepository } from './two-factor.repository';
import type {
  ConfirmEnableInput,
  PasswordConfirmInput,
  VerifyBackupCodeInput,
  VerifyTotpInput,
} from './two-factor.schema';

const log = createLogger('auth.two-factor');

/** Имя cookie второго шага входа (`better-auth.two_factor`, в продакшене — с `__Secure-`). */
const TWO_FACTOR_COOKIE_SUFFIX = '.two_factor';

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

type TwoFactorEventKind =
  'auth.two_factor_enabled' | 'auth.two_factor_disabled' | 'auth.backup_codes_regenerated';

/** Событие 2FA текущего пользователя (управление в профиле). */
function recordTwoFactorEvent(
  kind: TwoFactorEventKind,
  userId: string,
  requestHeaders: Headers,
): Promise<void> {
  return recordAuditEvent({
    kind,
    actor: { actorId: userId },
    data: {},
    request: auditRequestContext(requestHeaders),
  });
}

/**
 * Неверный код на втором шаге входа. Пользователь известен только подписанной cookie плагина,
 * поэтому событие без субъекта: оно видно в общем журнале администратора с IP.
 */
function recordFailedTwoFactor(code: string, requestHeaders: Headers): Promise<void> {
  return recordAuditEvent({
    kind: 'auth.sign_in_failed',
    actor: null,
    data: { method: 'two_factor', reason: code },
    request: auditRequestContext(requestHeaders),
  });
}

// ── Второй шаг входа ─────────────────────────────────────────────────────────

/** Есть ли незавершённый вход с 2FA (cookie второго шага). Её подпись проверяет Better Auth. */
export async function hasPendingTwoFactorSignIn(): Promise<boolean> {
  const store = await cookies();
  const pending = store.getAll().some((cookie) => cookie.name.endsWith(TWO_FACTOR_COOKIE_SUFFIX));
  log.debug({ pending }, '[twoFactor.signIn] pending check');
  return pending;
}

/** Код из приложения на втором шаге входа: создаёт сессию (cookie ставит nextCookies). */
export async function verifySignInTotp(input: VerifyTotpInput): Promise<void> {
  const requestHeaders = await headers();
  await enforceRateLimit('two-factor-verify', { ip: getClientIp(requestHeaders) });
  try {
    await getAuth().api.verifyTOTP({
      body: { code: input.code, trustDevice: input.trustDevice },
      headers: requestHeaders,
    });
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ method: 'totp', code: errorCode(mapped) }, '[twoFactor.signIn] failed');
    await recordFailedTwoFactor(authErrorCode(error), requestHeaders);
    throw mapped;
  }
  log.info({ method: 'totp', trustDevice: input.trustDevice }, '[twoFactor.signIn] verified');
}

/** Резервный код на втором шаге входа (одноразовый). */
export async function verifySignInBackupCode(input: VerifyBackupCodeInput): Promise<void> {
  const requestHeaders = await headers();
  await enforceRateLimit('two-factor-verify', { ip: getClientIp(requestHeaders) });
  try {
    await getAuth().api.verifyBackupCode({
      body: { code: input.code, trustDevice: input.trustDevice },
      headers: requestHeaders,
    });
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ method: 'backup', code: errorCode(mapped) }, '[twoFactor.signIn] failed');
    await recordFailedTwoFactor(authErrorCode(error), requestHeaders);
    throw mapped;
  }
  log.info({ method: 'backup', trustDevice: input.trustDevice }, '[twoFactor.signIn] verified');
}

// ── Управление в профиле ─────────────────────────────────────────────────────

/** Состояние 2FA текущего пользователя (из БД, а не из cookie-кеша сессии). */
export async function getMyTwoFactorState(): Promise<MyTwoFactorState> {
  const session = await requireUser();
  const state = await twoFactorRepository.findState(session.user.id);
  if (!state) throw new NotFoundError('Пользователь не найден');
  log.debug({ userId: session.user.id, ...state }, '[twoFactor.state]');
  return { enabled: state.twoFactorEnabled, hasPassword: state.hasPassword };
}

async function requirePasswordUser(): Promise<{ userId: string; enabled: boolean }> {
  const session = await requireUser();
  requireNotImpersonating(session, 'twoFactor');
  const state = await twoFactorRepository.findState(session.user.id);
  if (!state) throw new NotFoundError('Пользователь не найден');
  if (!state.hasPassword) {
    log.warn({ userId: session.user.id }, '[twoFactor] no password');
    throw new ValidationError(
      'Двухфакторная аутентификация работает только со входом по паролю. Сначала задайте пароль.',
    );
  }
  return { userId: session.user.id, enabled: state.twoFactorEnabled };
}

/**
 * Первый шаг включения: проверка пароля, новый секрет и резервные коды. 2FA включится только
 * после кода из приложения (confirmEnableTwoFactor) — до этого вход работает как раньше.
 */
export async function startEnableTwoFactor(input: PasswordConfirmInput): Promise<TwoFactorSetup> {
  const { userId, enabled } = await requirePasswordUser();
  if (enabled) throw new ValidationError('Двухфакторная аутентификация уже включена');
  const requestHeaders = await headers();
  await enforceRateLimit('change-password', { ip: getClientIp(requestHeaders), userId });

  try {
    const result = await getAuth().api.enableTwoFactor({
      body: { password: input.password, method: 'totp' },
      headers: requestHeaders,
    });
    if (result.method !== 'totp') {
      throw new Error(`Unexpected two-factor method: ${result.method}`);
    }
    log.info({ userId }, '[twoFactor.enable] started');
    return { totpURI: result.totpURI, backupCodes: result.backupCodes };
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ userId, code: errorCode(mapped) }, '[twoFactor.enable] failed');
    throw mapped;
  }
}

/** Код из приложения подтверждает настройку и включает 2FA (Better Auth обновит сессию). */
export async function confirmEnableTwoFactor(input: ConfirmEnableInput): Promise<void> {
  const { userId } = await requirePasswordUser();
  const requestHeaders = await headers();
  await enforceRateLimit('two-factor-verify', { ip: getClientIp(requestHeaders) });

  try {
    await getAuth().api.verifyTOTP({ body: { code: input.code }, headers: requestHeaders });
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ userId, code: errorCode(mapped) }, '[twoFactor.enable] confirm failed');
    throw mapped;
  }
  log.info({ userId }, '[twoFactor.enable] confirmed');
  await recordTwoFactorEvent('auth.two_factor_enabled', userId, requestHeaders);
}

export async function disableTwoFactor(input: PasswordConfirmInput): Promise<void> {
  const { userId } = await requirePasswordUser();
  const requestHeaders = await headers();
  await enforceRateLimit('change-password', { ip: getClientIp(requestHeaders), userId });

  try {
    await getAuth().api.disableTwoFactor({
      body: { password: input.password },
      headers: requestHeaders,
    });
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ userId, code: errorCode(mapped) }, '[twoFactor.disable] failed');
    throw mapped;
  }
  log.info({ userId }, '[twoFactor.disable]');
  await recordTwoFactorEvent('auth.two_factor_disabled', userId, requestHeaders);
}

/** Новые резервные коды; старые перестают действовать. */
export async function regenerateBackupCodes(input: PasswordConfirmInput): Promise<string[]> {
  const { userId, enabled } = await requirePasswordUser();
  if (!enabled) throw new ValidationError('Двухфакторная аутентификация не включена');
  const requestHeaders = await headers();
  await enforceRateLimit('change-password', { ip: getClientIp(requestHeaders), userId });

  try {
    const result = await getAuth().api.generateBackupCodes({
      body: { password: input.password },
      headers: requestHeaders,
    });
    log.info({ userId }, '[twoFactor.backupCodes] regenerated');
    await recordTwoFactorEvent('auth.backup_codes_regenerated', userId, requestHeaders);
    return result.backupCodes;
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ userId, code: errorCode(mapped) }, '[twoFactor.backupCodes] failed');
    throw mapped;
  }
}
