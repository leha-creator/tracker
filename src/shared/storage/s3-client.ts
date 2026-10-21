import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';

import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

const log = createLogger('storage');

const globalForS3 = globalThis as unknown as { s3Client?: S3Client; s3PresignClient?: S3Client };

function createClient(endpoint: string): S3Client {
  const env = getEnv();
  return new S3Client({
    endpoint,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * S3-клиент (singleton): локально MinIO, в проде Yandex Object Storage. Адресация path-style
 * (`S3_FORCE_PATH_STYLE`), её принимают оба.
 */
export function getS3Client(): S3Client {
  if (!globalForS3.s3Client) {
    const env = getEnv();
    globalForS3.s3Client = createClient(env.S3_ENDPOINT);
    // Ключи доступа не логируем.
    log.info(
      { endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE },
      '[storage] s3 client created',
    );
  }
  return globalForS3.s3Client;
}

/**
 * Клиент для подписи ссылок, которые открывает браузер: адрес — `S3_PUBLIC_ENDPOINT`.
 * Подпись не требует сети, поэтому клиенту не нужно видеть хранилище с сервера.
 */
export function getS3PresignClient(): S3Client {
  const env = getEnv();
  if (env.S3_PUBLIC_ENDPOINT === env.S3_ENDPOINT) return getS3Client();
  if (!globalForS3.s3PresignClient) {
    globalForS3.s3PresignClient = createClient(env.S3_PUBLIC_ENDPOINT);
    log.info({ endpoint: env.S3_PUBLIC_ENDPOINT }, '[storage] s3 presign client created');
  }
  return globalForS3.s3PresignClient;
}

/** Имя бакета для вложений. */
export function getBucketName(): string {
  return getEnv().S3_BUCKET;
}
