import {
  NOTIFICATION_TYPE_INFO,
  NOTIFICATION_TYPES,
  supportsChannel,
  type NotificationChannels,
  type NotificationType,
} from './notification-type';

/**
 * Итоговые каналы типа: сохранённая настройка или значения по умолчанию; канал, который тип не
 * поддерживает, выключен всегда.
 */
export function resolveChannels(
  type: NotificationType,
  preference: NotificationChannels | null | undefined,
): NotificationChannels {
  const source = preference ?? NOTIFICATION_TYPE_INFO[type].defaults;
  return {
    inApp: supportsChannel(type, 'inApp') && source.inApp,
    email: supportsChannel(type, 'email') && source.email,
  };
}

/** Матрица «тип × канал» для всех типов по сохранённым строкам настроек. */
export function resolvePreferenceMatrix(
  saved: ReadonlyMap<NotificationType, NotificationChannels>,
): Record<NotificationType, NotificationChannels> {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, resolveChannels(type, saved.get(type))]),
  ) as Record<NotificationType, NotificationChannels>;
}
