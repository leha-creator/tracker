import 'server-only';

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { createLogger } from '@/shared/logger';

import { getBucketName, getS3Client, getS3PresignClient } from './s3-client';

const log = createLogger('storage');

/** Максимум ключей в одном запросе DeleteObjects (ограничение S3). */
const DELETE_BATCH_SIZE = 1000;

export interface UploadPost {
  url: string;
  fields: Record<string, string>;
}

/**
 * Presigned POST для загрузки из браузера. Политика фиксирует ключ, `Content-Type` и точный
 * размер: другой файл хранилище не примет.
 */
export async function createUploadPost(input: {
  key: string;
  contentType: string;
  size: number;
  expiresIn: number;
}): Promise<UploadPost> {
  const { key, contentType, size, expiresIn } = input;
  const post = await createPresignedPost(getS3PresignClient(), {
    Bucket: getBucketName(),
    Key: key,
    Fields: { 'Content-Type': contentType },
    Conditions: [
      ['eq', '$key', key],
      ['eq', '$Content-Type', contentType],
      ['content-length-range', size, size],
    ],
    Expires: expiresIn,
  });
  // URL и поля политики содержат подпись — не логируем.
  log.debug({ key, size, expiresIn }, '[storage] upload post created');
  return post;
}

/** Presigned GET с заданными `Content-Disposition` и `Content-Type` ответа. */
export async function createDownloadUrl(input: {
  key: string;
  contentType: string;
  contentDisposition: string;
  expiresIn: number;
}): Promise<string> {
  const { key, contentType, contentDisposition, expiresIn } = input;
  const url = await getSignedUrl(
    getS3PresignClient(),
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: contentDisposition,
    }),
    { expiresIn },
  );
  log.debug({ key, expiresIn }, '[storage] download url created');
  return url;
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata.httpStatusCode === 404)
  );
}

/** Метаданные объекта; `null` — объекта нет. Прочие ошибки хранилища пробрасываются. */
export async function headObject(key: string): Promise<{ size: number } | null> {
  try {
    const result = await getS3Client().send(
      new HeadObjectCommand({ Bucket: getBucketName(), Key: key }),
    );
    return { size: result.ContentLength ?? 0 };
  } catch (error) {
    if (isNotFound(error)) return null;
    log.error({ err: error, key }, '[storage] head object failed');
    throw error;
  }
}

/** Первые `bytes` байт объекта (для проверки сигнатуры файла). */
export async function readObjectPrefix(key: string, bytes: number): Promise<Uint8Array> {
  try {
    const result = await getS3Client().send(
      new GetObjectCommand({ Bucket: getBucketName(), Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
  } catch (error) {
    log.error({ err: error, key }, '[storage] read object prefix failed');
    throw error;
  }
}

/**
 * Начало объекта как текст UTF-8 (для просмотра текстовых файлов): не больше `maxBytes`.
 * `truncated` — объект длиннее лимита. Неполная последняя последовательность UTF-8 заменяется
 * символом U+FFFD, а не роняет чтение.
 */
export async function readObjectText(
  key: string,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  try {
    // На байт больше лимита: так видно, что объект длиннее, без отдельного HeadObject.
    const result = await getS3Client().send(
      new GetObjectCommand({ Bucket: getBucketName(), Key: key, Range: `bytes=0-${maxBytes}` }),
    );
    const bytes = result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
    const truncated = bytes.length > maxBytes;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(
      truncated ? bytes.subarray(0, maxBytes) : bytes,
    );
    // Ключ не логируем: только объём.
    log.debug({ bytes: Math.min(bytes.length, maxBytes), truncated }, '[storage] read object text');
    return { text, truncated };
  } catch (error) {
    log.error({ err: error }, '[storage] read object text failed');
    throw error;
  }
}

/**
 * Удаляет объекты пачками. Не бросает исключений: возвращает число ключей, которые удалить
 * не удалось (ошибки логируются).
 */
export async function deleteObjects(keys: readonly string[]): Promise<number> {
  let failed = 0;
  for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
    const batch = keys.slice(start, start + DELETE_BATCH_SIZE);
    try {
      const result = await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: getBucketName(),
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const errors = result.Errors ?? [];
      if (errors.length > 0) {
        failed += errors.length;
        log.error(
          { count: errors.length, codes: [...new Set(errors.map((item) => item.Code))] },
          '[storage] some objects were not deleted',
        );
      }
    } catch (error) {
      failed += batch.length;
      log.error({ err: error, count: batch.length }, '[storage] delete objects failed');
    }
  }
  log.debug({ count: keys.length, failed }, '[storage] objects deleted');
  return failed;
}
