import 'server-only';

import type { AuthSession } from '@/shared/auth';
import { ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  NOTIFICATION_TYPE_INFO,
  NOTIFICATION_TYPES,
  resolveChannels,
  resolvePreferenceMatrix,
  supportsChannel,
  type NotificationChannels,
} from '../../models';
import type { NotificationPreferenceDto } from './preference.dto';
import { preferenceRepository } from './preference.repository';
import type { UpdateNotificationPreferenceInput } from './preference.schema';

const log = createLogger('notifications.preference');

/** Настройки текущего пользователя по всем типам: сохранённые или значения по умолчанию. */
export async function getMyNotificationPreferences(
  session: AuthSession,
): Promise<NotificationPreferenceDto[]> {
  const userId = session.user.id;
  const saved = (await preferenceRepository.listForUsers([userId])).get(userId) ?? new Map();
  const matrix = resolvePreferenceMatrix(saved);
  log.debug({ userId, saved: saved.size }, '[preference.list]');
  return NOTIFICATION_TYPES.map((type) => {
    const info = NOTIFICATION_TYPE_INFO[type];
    return {
      type,
      label: info.label,
      description: info.description,
      channels: info.channels,
      value: matrix[type],
    };
  });
}

/**
 * Включает или выключает один канал типа. Сохраняется вся строка типа: значение второго канала
 * берётся из текущей настройки, чтобы значения по умолчанию не потерялись.
 */
export async function updateNotificationPreference(
  session: AuthSession,
  input: UpdateNotificationPreferenceInput,
): Promise<NotificationChannels> {
  const userId = session.user.id;
  const { type, channel, enabled } = input;
  if (!supportsChannel(type, channel)) {
    log.warn({ userId, type, channel }, '[preference.update] unsupported channel');
    throw new ValidationError('Этот канал недоступен для выбранного типа уведомлений');
  }

  const saved = (await preferenceRepository.listForUsers([userId])).get(userId);
  const current = resolveChannels(type, saved?.get(type));
  const next = { ...current, [channel]: enabled };
  const result = await preferenceRepository.upsert(userId, type, next);
  log.info({ userId, type, channel, enabled }, '[preference] updated');
  return resolveChannels(type, result);
}
