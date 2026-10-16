import 'server-only';

import { randomUUID } from 'node:crypto';

import { sharesWorkspace } from '@/modules/workspaces';
import { isAdmin } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import {
  createDownloadUrl,
  createUploadPost,
  deleteObjects,
  headObject,
  readObjectPrefix,
  type UploadPost,
} from '@/shared/storage';

import { updateAuthUser } from '../../auth-api';
import {
  AVATAR_DOWNLOAD_TTL_SECONDS,
  AVATAR_MAX_SIZE,
  AVATAR_SIGNATURE_BYTES,
  AVATAR_UPLOAD_TTL_SECONDS,
  avatarContentTypeOfKey,
  avatarStorageKey,
  avatarUrl,
  detectImageType,
} from '../../models';
import { profileRepository } from '../profile/profile.repository';
import type { CompleteAvatarUploadInput, RequestAvatarUploadInput } from './avatar.schema';

const log = createLogger('profiles.avatar');

/** Удаляет объекты фото. Не бросает: действие уже выполнено, «сирота» видна в логах. */
async function deleteAvatarObjects(keys: readonly string[], context: object): Promise<void> {
  if (keys.length === 0) return;
  const failed = await deleteObjects(keys);
  if (failed > 0) log.error({ ...context, failed }, '[avatar] storage cleanup failed');
}

async function rejectUpload(key: string, context: object, reason: string, message: string) {
  log.warn({ ...context, reason }, '[avatar] upload rejected');
  await deleteAvatarObjects([key], { ...context, reason });
  return new ValidationError(message);
}

/** Слот загрузки фото: presigned POST на ключ текущего пользователя. */
export async function requestAvatarUpload(
  session: AuthSession,
  input: RequestAvatarUploadInput,
): Promise<UploadPost & { uploadId: string }> {
  const userId = session.user.id;
  const uploadId = randomUUID();
  const post = await createUploadPost({
    key: avatarStorageKey(userId, uploadId, input.contentType),
    contentType: input.contentType,
    size: input.size,
    expiresIn: AVATAR_UPLOAD_TTL_SECONDS,
  });
  log.info(
    { userId, uploadId, contentType: input.contentType, size: input.size },
    '[avatar] upload requested',
  );
  return { uploadId, ...post };
}

/**
 * Подтверждение загрузки: объект есть, размер в пределах, сигнатура совпадает с типом. Ключ
 * строится из сессии — подтвердить чужую загрузку нельзя. Прежнее фото удаляется.
 */
export async function completeAvatarUpload(
  session: AuthSession,
  input: CompleteAvatarUploadInput,
): Promise<{ image: string }> {
  const userId = session.user.id;
  const key = avatarStorageKey(userId, input.uploadId, input.contentType);
  const context = { userId, uploadId: input.uploadId };

  const object = await headObject(key);
  if (!object) {
    log.warn({ ...context, reason: 'missing-object' }, '[avatar] upload rejected');
    throw new ValidationError('Фото не загрузилось — попробуйте ещё раз');
  }
  if (object.size === 0 || object.size > AVATAR_MAX_SIZE) {
    throw await rejectUpload(key, context, 'size', 'Фото — не больше 2 МБ');
  }
  const prefix = await readObjectPrefix(key, AVATAR_SIGNATURE_BYTES);
  if (detectImageType(prefix) !== input.contentType) {
    throw await rejectUpload(
      key,
      context,
      'signature',
      'Файл не похож на картинку PNG, JPEG или WebP',
    );
  }

  const previous = await profileRepository.setAvatarKey(userId, key);
  const image = avatarUrl(userId, input.uploadId);
  await updateAuthUser({ image });
  if (previous && previous !== key) await deleteAvatarObjects([previous], context);
  log.info({ ...context, size: object.size, replaced: previous !== null }, '[avatar] uploaded');
  return { image };
}

export async function removeAvatar(session: AuthSession): Promise<void> {
  const userId = session.user.id;
  const previous = await profileRepository.setAvatarKey(userId, null);
  await updateAuthUser({ image: null });
  if (previous) await deleteAvatarObjects([previous], { userId });
  log.info({ userId, hadAvatar: previous !== null }, '[avatar] removed');
}

/**
 * Ссылка на фото: своё, пользователя из общего пространства или любое — администратору.
 * Остальным — `NotFoundError` (не раскрываем, есть ли пользователь).
 */
/** Фото агента пространства (статичный файл public/agent-avatar.svg). */
export const AGENT_AVATAR_PATH = '/agent-avatar.svg';

export async function getAvatarDownload(
  session: AuthSession,
  userId: string,
): Promise<{ url: string }> {
  const viewerId = session.user.id;
  // Агент: статичный робот из public/. Это не данные пользователя, поэтому без проверки общего
  // пространства — робот виден и у отключённого агента (его членство снято) в истории задач.
  if (await profileRepository.isAgent(userId)) {
    log.debug({ viewerId, userId }, '[avatar.download] agent avatar');
    return { url: AGENT_AVATAR_PATH };
  }
  const allowed =
    viewerId === userId || isAdmin(session.user) || (await sharesWorkspace(viewerId, userId));
  if (!allowed) {
    log.warn({ viewerId, userId }, '[avatar.download] forbidden');
    throw new NotFoundError('Фото не найдено');
  }
  const key = await profileRepository.findAvatarKey(userId);
  const contentType = key ? avatarContentTypeOfKey(key) : null;
  if (!key || !contentType) {
    log.debug({ viewerId, userId }, '[avatar.download] no avatar');
    throw new NotFoundError('Фото не найдено');
  }
  const url = await createDownloadUrl({
    key,
    contentType,
    contentDisposition: 'inline',
    expiresIn: AVATAR_DOWNLOAD_TTL_SECONDS,
  });
  log.debug({ viewerId, userId }, '[avatar.download]');
  return { url };
}

/**
 * Удаление фото вместе с пользователем (админка). Ключ читается до удаления пользователя —
 * строка профиля уйдёт каскадом; объект удаляет возвращённая функция после удаления.
 */
export async function prepareAvatarCleanup(userId: string): Promise<() => Promise<void>> {
  const key = await profileRepository.findAvatarKey(userId);
  log.debug({ userId, hasAvatar: key !== null }, '[avatar.prepareCleanup]');
  return async () => {
    if (key) await deleteAvatarObjects([key], { userId, reason: 'user-deleted' });
  };
}
