import type { GlobalRole } from '@/shared/access/global-role';

/** Свой профиль: всё, что можно изменить, и сведения об аккаунте. */
export interface MyProfileDto {
  userId: string;
  name: string;
  email: string;
  /** Адрес фото в приложении; null — фото нет. */
  image: string | null;
  position: string | null;
  bio: string | null;
  globalRole: GlobalRole;
  registeredAt: Date;
}

/** Публичные поля профиля — для страницы участника и карточки при наведении. */
export interface ProfileCardDto {
  userId: string;
  name: string;
  image: string | null;
  position: string | null;
  bio: string | null;
}
