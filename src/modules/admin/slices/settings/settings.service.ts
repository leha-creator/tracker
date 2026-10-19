import 'server-only';

import { requireAdmin } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';
import {
  getSignupPolicy,
  getStorageSettings,
  loadResourceSettings,
  saveSignupPolicy,
  saveStorageSettings,
  SIGNUP_MODE_LABELS,
  type SignupMode,
} from '@/shared/resource-settings';

import { userRepository } from '../user/user.repository';
import type { AdminResourceSettingsDto } from './settings.dto';
import type { UpdateSignupPolicyInput, UpdateStorageSettingsInput } from './settings.schema';

const log = createLogger('admin.settings');

export async function getAdminResourceSettings(): Promise<AdminResourceSettingsDto> {
  await requireAdmin();
  const [signup, storage, { updatedAt, updatedById }] = await Promise.all([
    getSignupPolicy(),
    getStorageSettings(),
    loadResourceSettings(),
  ]);
  const updatedBy = updatedById ? await userRepository.findById(updatedById) : null;
  return {
    signup,
    storage: { ...storage, envQuotaMb: getEnv().DOCUMENTS_WORKSPACE_QUOTA_MB },
    updatedAt,
    updatedBy: updatedBy ? { id: updatedBy.id, name: updatedBy.name } : null,
  };
}

/** Событие журнала с изменёнными полями под понятными администратору названиями. */
async function recordSettingsChanged(
  session: AuthSession,
  changes: Record<string, string>,
  scope: string,
): Promise<void> {
  if (Object.keys(changes).length === 0) {
    log.debug({ actorId: session.user.id }, `[admin.settings.${scope}] nothing changed`);
    return;
  }
  await recordAuditEvent({
    kind: 'admin.settings_changed',
    actor: auditActorFromSession(session),
    data: { changes },
  });
}

export async function updateSignupPolicy(input: UpdateSignupPolicyInput): Promise<void> {
  const session = await requireAdmin();
  const changes = await saveSignupPolicy(input, session.user.id);
  const labeled: Record<string, string> = {};
  if (changes.signupMode) {
    labeled['Регистрация'] = SIGNUP_MODE_LABELS[changes.signupMode as SignupMode];
  }
  if (changes.allowedEmailDomains) labeled['Домены email'] = changes.allowedEmailDomains;
  await recordSettingsChanged(session, labeled, 'signup');
}

export async function updateStorageSettings(input: UpdateStorageSettingsInput): Promise<void> {
  const session = await requireAdmin();
  const changes = await saveStorageSettings(input, session.user.id);
  const labeled: Record<string, string> = {};
  if (changes.defaultWorkspaceQuotaMb) {
    labeled['Квота по умолчанию, МБ'] = changes.defaultWorkspaceQuotaMb;
  }
  await recordSettingsChanged(session, labeled, 'storage');
}
