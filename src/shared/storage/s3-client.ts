import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';

import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

const log = createLogger('storage');

const globalForS3 = globalThis as unknown as { s3Client?: S3Client };

/** S3-клиент (singleton). Для MinIO используется path-style адресация. */
export function getS3Client(): S3Client {
  if (!globalForS3.s3Client) {
    const env = getEnv();
    globalForS3.s3Client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    // Ключи доступа не логируем.
    log.info(
      { endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE },
      '[storage] s3 client created',
    );
  }
  return globalForS3.s3Client;
}

/** Имя бакета для вложений. */
export function getBucketName(): string {
  return getEnv().S3_BUCKET;
}
