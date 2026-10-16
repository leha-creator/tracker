import type { NotificationChannel, NotificationChannels, NotificationType } from '../../models';

export interface NotificationPreferenceDto {
  type: NotificationType;
  label: string;
  description: string;
  /** Поддерживаемые каналы; остальные в настройках недоступны. */
  channels: readonly NotificationChannel[];
  value: NotificationChannels;
}
