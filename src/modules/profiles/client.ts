/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, константы и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export {
  AVATAR_ACCEPT,
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_SIZE,
  isAvatarContentType,
  isAvatarUrl,
} from './models/avatar';
export type { AvatarContentType } from './models/avatar';
export {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_POSITION_MAX_LENGTH,
} from './models/profile';
export {
  completeAvatarUploadAction,
  removeAvatarAction,
  requestAvatarUploadAction,
} from './slices/avatar/avatar.actions';
export type { AvatarUploadDto } from './slices/avatar/avatar.actions';
export { updateProfileAction } from './slices/profile/profile.actions';
export type { MyProfileDto, ProfileCardDto } from './slices/profile/profile.dto';
export { updateProfileSchema } from './slices/profile/profile.schema';
