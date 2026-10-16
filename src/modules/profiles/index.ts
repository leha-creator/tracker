// Публичный API модуля для серверного кода (страницы, Route Handlers, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: profiles → workspaces (общее пространство для доступа к фото); admin → profiles.
export * from './client';

export { getAvatarDownload, prepareAvatarCleanup } from './slices/avatar/avatar.service';
export { getMyProfile, getProfileCards } from './slices/profile/profile.service';
