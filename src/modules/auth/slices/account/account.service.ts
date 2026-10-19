import 'server-only';

import { createLogger } from '@/shared/logger';

import type { AccountMetricsDto, AccountSessionDto } from './account.dto';
import { accountRepository } from './account.repository';

// Операции над чужой учётной записью и метрики учётных записей. Системные функции без сессии —
// только для модуля admin, уже вызвавшего requireAdmin(). Единая точка для будущего IdP: после
// переезда входа меняется реализация (admin API IdP), а вызывающий код — нет.

const log = createLogger('auth.account');

/** Действующие сессии пользователя, новые сверху. Токены сессий не отдаются. */
export async function listUserSessionsBySystem(
  userId: string,
  now: Date = new Date(),
): Promise<AccountSessionDto[]> {
  const rows = await accountRepository.listActiveSessions(userId, now);
  return rows.map(({ impersonatedBy, ...row }) => ({
    ...row,
    impersonated: impersonatedBy !== null,
  }));
}

/** Завершает одну сессию пользователя. false — сессии нет или она чужая. */
export async function revokeUserSessionBySystem(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const deleted = await accountRepository.deleteSession(userId, sessionId);
  log.debug({ userId, sessionId, deleted }, '[auth.account.revokeSession]');
  return deleted > 0;
}

export async function markEmailVerifiedBySystem(userId: string): Promise<void> {
  await accountRepository.markEmailVerified(userId);
  log.debug({ userId }, '[auth.account.markEmailVerified]');
}

/** Удаляет секрет и резервные коды 2FA, снимает флаг. Сессии завершает вызывающий. */
export async function resetTwoFactorBySystem(userId: string): Promise<void> {
  await accountRepository.resetTwoFactor(userId);
  log.debug({ userId }, '[auth.account.resetTwoFactor]');
}

/**
 * Метрики учётных записей: пользователи, сессии, регистрации по дням с `signupsSince`,
 * неудачные входы с `failedSignInsSince`.
 */
export async function getAccountMetrics(input: {
  now: Date;
  signupsSince: Date;
  failedSignInsSince: Date;
}): Promise<AccountMetricsDto> {
  const [users, sessions, signupsByDay, failedSignIns] = await Promise.all([
    accountRepository.userCounts(input.now),
    accountRepository.sessionCounts(input.now),
    accountRepository.signupsByDay(input.signupsSince),
    accountRepository.countFailedSignIns(input.failedSignInsSince),
  ]);
  return { users, sessions, signupsByDay, failedSignIns };
}
