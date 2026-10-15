import 'server-only';

import { HeadBucketCommand } from '@aws-sdk/client-s3';

import { createLogger } from '@/shared/logger';

import { getBucketName, getS3Client } from './s3-client';

const log = createLogger('storage');

/** Таймаут проверки: недоступное хранилище не должно вешать health-эндпоинт. */
const HEALTH_CHECK_TIMEOUT_MS = 3000;

export interface StorageHealthResult {
  ok: boolean;
  latencyMs: number;
}

/** Проверка доступности хранилища и бакета через `HeadBucket`. Не бросает исключений. */
export async function checkStorage(): Promise<StorageHealthResult> {
  const startedAt = performance.now();
  const bucket = getBucketName();
  log.debug({ bucket }, '[checkStorage] HeadBucket start');
  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: bucket }), {
      abortSignal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    log.debug({ bucket, latencyMs }, '[checkStorage] ok');
    return { ok: true, latencyMs };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    log.error({ err: error, bucket, latencyMs }, '[checkStorage] storage is unavailable');
    return { ok: false, latencyMs };
  }
}
