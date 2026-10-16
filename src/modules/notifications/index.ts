// Публичный API модуля для серверного кода (страницы, Route Handlers, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимостей от других модулей нет: tasks и workspaces сами вызывают notify / notifyByEmail.
export * from './client';

export { excerpt as notificationExcerpt } from './models';
export type { NotificationEvent } from './models';
export {
  countMyUnreadNotifications,
  listMyNotifications,
  notify,
  notifyByEmail,
} from './slices/notification/notification.service';
export { NOTIFICATIONS_MENU_SIZE } from './slices/notification/notification.schema';
export { getMyNotificationPreferences } from './slices/preference/preference.service';
