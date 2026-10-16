/**
 * Публичный API модуля для клиентских компонентов: Server Actions, константы и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export { NOTIFICATION_TYPE_INFO, NOTIFICATION_TYPES } from './models/notification-type';
export type {
  NotificationChannel,
  NotificationChannels,
  NotificationType,
} from './models/notification-type';
export {
  loadMoreNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from './slices/notification/notification.actions';
export type {
  NotificationActorDto,
  NotificationDto,
  NotificationPageDto,
} from './slices/notification/notification.dto';
export { updateNotificationPreferenceAction } from './slices/preference/preference.actions';
export type { NotificationPreferenceDto } from './slices/preference/preference.dto';
