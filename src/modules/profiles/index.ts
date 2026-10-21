// Публичный API модуля для серверного кода (страницы, Route Handlers, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: нет; admin → profiles.
export * from './client';

export { getMyProfile, getProfileCards } from './slices/profile/profile.service';
