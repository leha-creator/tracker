import 'server-only';

import { requireAdmin } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';
import {
  getStorageSettings,
  loadResourceSettings,
  saveStorageSettings,
} from '@/shared/resource-settings';

import { userRepository } from '../user/user.repository';
import type { AdminResourceSettingsDto } from './settings.dto';
import type { UpdateStorageSettingsInput } from './settings.schema';

const log = createLogger('admin.settings');

export async function getAdminResourceSettings(): Promise<AdminResourceSettingsDto> {
  await requireAdmin();
  const [storage, { updatedAt, updatedById }] = await Promise.all([
    getStorageSettings(),
    loadResourceSettings(),
  ]);
  const updatedBy = updatedById ? await userRepository.findById(updatedById) : null;
  return {
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

export async function updateStorageSettings(input: UpdateStorageSettingsInput): Promise<void> {
  const session = await requireAdmin();
  const changes = await saveStorageSettings(input, session.user.id);
  const labeled: Record<string, string> = {};
  if (changes.defaultWorkspaceQuotaMb) {
    labeled['Квота по умолчанию, МБ'] = changes.defaultWorkspaceQuotaMb;
  }
  await recordSettingsChanged(session, labeled, 'storage');
}
