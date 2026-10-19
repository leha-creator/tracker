import 'server-only';

import { prisma } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import { loadResourceSettings, readSettingsRow, writeSettingsFields } from './settings-store';
import { checkSignup, emailDomain, type SignupMode, type SignupRejection } from './signup-policy';

// Группа «Регистрация» настроек ресурса. Переедет в IdP вместе с проверкой в хуке
// user.create.before: удаляется целиком, группу «Хранилище» не трогает.

const log = createLogger('resource-settings.signup');

export interface SignupPolicy {
  signupMode: SignupMode;
  /** Домены в нижнем регистре; пусто — любые. */
  allowedEmailDomains: string[];
}

export async function getSignupPolicy(): Promise<SignupPolicy> {
  const { signupMode, allowedEmailDomains } = await loadResourceSettings();
  return { signupMode, allowedEmailDomains };
}

/** Сохраняет политику регистрации. Возвращает изменённые поля с новыми значениями — для журнала. */
export async function saveSignupPolicy(
  input: SignupPolicy,
  actorId: string,
): Promise<Partial<Record<keyof SignupPolicy, string>>> {
  const previous = await readSettingsRow();
  await writeSettingsFields(input, actorId, 'signup');
  const changes: Partial<Record<keyof SignupPolicy, string>> = {};
  if (previous.signupMode !== input.signupMode) changes.signupMode = input.signupMode;
  if (previous.allowedEmailDomains.join(',') !== input.allowedEmailDomains.join(',')) {
    changes.allowedEmailDomains = input.allowedEmailDomains.join(', ') || '—';
  }
  return changes;
}

/**
 * Есть ли действующее приглашение в пространство на этот email. Чтение таблицы модуля
 * workspaces: shared не зависит от модулей, а правило регистрации нужно хуку Better Auth.
 */
async function hasPendingInvitation(email: string, now: Date): Promise<boolean> {
  const count = await prisma.workspaceInvitation.count({
    where: {
      email: { equals: email.trim(), mode: 'insensitive' },
      status: 'pending',
      expiresAt: { gt: now },
    },
  });
  return count > 0;
}

/**
 * Можно ли зарегистрировать email по настройкам ресурса: причина отказа или null. Общая точка
 * для формы регистрации (понятное сообщение) и хука создания пользователя (вход через GitHub).
 */
export async function evaluateSignup(input: {
  email: string;
  isAdminEmail: boolean;
}): Promise<SignupRejection | null> {
  const policy = await getSignupPolicy();
  const needsInvitation = policy.signupMode !== 'open' || policy.allowedEmailDomains.length > 0;
  const rejection = checkSignup({
    email: input.email,
    mode: policy.signupMode,
    allowedEmailDomains: policy.allowedEmailDomains,
    isAdminEmail: input.isAdminEmail,
    hasPendingInvitation:
      needsInvitation && !input.isAdminEmail
        ? await hasPendingInvitation(input.email, new Date())
        : false,
  });
  if (rejection) {
    // Домен — без локальной части адреса.
    log.warn({ reason: rejection, domain: emailDomain(input.email) }, '[auth.signup] rejected');
  }
  return rejection;
}
