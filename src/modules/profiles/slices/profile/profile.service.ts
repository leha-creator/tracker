import 'server-only';

import { parseGlobalRole } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { emptyToNull, isAvatarUrl } from '../../models';
import type { MyProfileDto, ProfileCardDto } from './profile.dto';
import { profileRepository } from './profile.repository';
import type { UpdateProfileInput } from './profile.schema';

const log = createLogger('profiles');

/** Только адреса фото, выданные приложением (см. `isAvatarUrl`). */
function safeImage(image: string | null): string | null {
  return isAvatarUrl(image) ? image : null;
}

export async function getMyProfile(session: AuthSession): Promise<MyProfileDto> {
  const userId = session.user.id;
  const row = await profileRepository.findUser(userId);
  if (!row) {
    log.warn({ userId }, '[profile.getMine] user not found');
    throw new NotFoundError('Пользователь не найден');
  }
  log.debug({ userId, hasProfile: row.profile !== null }, '[profile.getMine]');
  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    image: safeImage(row.image),
    position: row.profile?.position ?? null,
    bio: row.profile?.bio ?? null,
    globalRole: parseGlobalRole(row.role),
    registeredAt: row.createdAt,
  };
}

/** Должность и описание — в профиле tasker; имя и фото приходят из IdP при входе. */
export async function updateProfile(
  session: AuthSession,
  input: UpdateProfileInput,
): Promise<void> {
  const userId = session.user.id;
  const current = await profileRepository.findUser(userId);
  if (!current) throw new NotFoundError('Пользователь не найден');

  const position = emptyToNull(input.position);
  const bio = emptyToNull(input.bio);
  const changed = [
    position !== (current.profile?.position ?? null) && 'position',
    bio !== (current.profile?.bio ?? null) && 'bio',
  ].filter((field): field is string => field !== false);

  if (changed.length === 0) {
    log.debug({ userId }, '[profile.update] nothing changed');
    return;
  }
  await profileRepository.updateFields(userId, { position, bio });
  log.info({ userId, changed }, '[profile] updated');
}

/**
 * Публичные поля профилей. Без проверки сессии: для серверного кода, который уже проверил, что
 * смотрящий и эти пользователи — участники одного пространства.
 */
export async function getProfileCards(
  userIds: readonly string[],
): Promise<Map<string, ProfileCardDto>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const rows = await profileRepository.findCards(unique);
  log.debug({ requested: unique.length, found: rows.length }, '[profile.getCards]');
  return new Map(
    rows.map((row) => [
      row.id,
      {
        userId: row.id,
        name: row.name,
        image: safeImage(row.image),
        position: row.profile?.position ?? null,
        bio: row.profile?.bio ?? null,
      },
    ]),
  );
}
