/** Типы событий. Порядок совпадает с enum NotificationType в схеме; новые — только в конец. */
export const NOTIFICATION_TYPES = [
  'mention',
  'task_assigned',
  'task_comment',
  'workspace_invitation',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Каналы доставки: в приложении (колокольчик) и письмом. */
export const NOTIFICATION_CHANNELS = ['inApp', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationChannels = Record<NotificationChannel, boolean>;

export interface NotificationTypeInfo {
  /** Название в настройках. */
  label: string;
  /** Пояснение в настройках. */
  description: string;
  /** Поддерживаемые каналы: остальные всегда выключены. */
  channels: readonly NotificationChannel[];
  /** Значения, пока пользователь не менял настройку. */
  defaults: NotificationChannels;
}

export const NOTIFICATION_TYPE_INFO: Record<NotificationType, NotificationTypeInfo> = {
  mention: {
    label: 'Упоминания',
    description: 'Вас упомянули через @ в комментарии',
    channels: ['inApp', 'email'],
    defaults: { inApp: true, email: true },
  },
  task_assigned: {
    label: 'Назначение ответственным',
    description: 'Вас назначили ответственным за задачу',
    channels: ['inApp', 'email'],
    defaults: { inApp: true, email: true },
  },
  task_comment: {
    label: 'Комментарии к моим задачам',
    description: 'Новый комментарий к задаче, где вы ответственный или автор',
    channels: ['inApp', 'email'],
    defaults: { inApp: true, email: false },
  },
  workspace_invitation: {
    label: 'Приглашения в пространства',
    description: 'Вас пригласили в пространство (письмо с приглашением приходит всегда)',
    channels: ['inApp'],
    defaults: { inApp: true, email: false },
  },
};

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function supportsChannel(type: NotificationType, channel: NotificationChannel): boolean {
  return NOTIFICATION_TYPE_INFO[type].channels.includes(channel);
}
