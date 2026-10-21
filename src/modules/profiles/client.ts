/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, константы и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export { isAvatarUrl } from './models/avatar';
export { PROFILE_BIO_MAX_LENGTH, PROFILE_POSITION_MAX_LENGTH } from './models/profile';
export { updateProfileAction } from './slices/profile/profile.actions';
export type { MyProfileDto, ProfileCardDto } from './slices/profile/profile.dto';
export { updateProfileSchema } from './slices/profile/profile.schema';
