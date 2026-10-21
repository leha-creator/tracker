import 'server-only';

import { env } from '@/shared/env';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('integrations:meet');

export interface MeetConfig {
  /** Origin meet без завершающего `/`. */
  url: string;
  contextSecret: string;
  webhookSecret: string;
}

let announced = false;

/** Настройки связки с meet (MEET_*); null — интеграция выключена. Состояние пишется в лог один раз. */
export function getMeetConfig(): MeetConfig | null {
  const config =
    env.MEET_ENABLED && env.MEET_URL && env.MEET_CONTEXT_SECRET && env.MEET_WEBHOOK_SECRET
      ? {
          url: env.MEET_URL,
          contextSecret: env.MEET_CONTEXT_SECRET,
          webhookSecret: env.MEET_WEBHOOK_SECRET,
        }
      : null;
  if (!announced) {
    announced = true;
    log.info(
      { enabled: config !== null, meetUrl: config?.url ?? null },
      '[meet] integration state',
    );
  }
  return config;
}

export function isMeetEnabled(): boolean {
  return getMeetConfig() !== null;
}

/** Настройки или NOT_FOUND: без MEET_* созвонов по задачам нет. */
export function requireMeetConfig(): MeetConfig {
  const config = getMeetConfig();
  if (!config) throw new NotFoundError('Связка с meet не настроена');
  return config;
}

/** Адрес задачи в tasker — для ссылки «Вернуться к задаче» в meet. */
export function taskUrl(workspaceSlug: string, taskNumber: number): string {
  return new URL(`/w/${workspaceSlug}/tasks/${taskNumber}`, env.BETTER_AUTH_URL).toString();
}
