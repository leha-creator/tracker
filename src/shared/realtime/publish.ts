import 'server-only';

import { prisma } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import {
  createRealtimeEvent,
  encodeRealtimeEvent,
  REALTIME_CHANNEL,
  type RealtimeEventInput,
} from './realtime-event';

const log = createLogger('realtime');

/**
 * Публикует событие в канал Postgres. Вызывать после коммита транзакции: `NOTIFY` внутри
 * транзакции доставился бы только при коммите, но отдельный запрос проще и не держит транзакцию.
 * Никогда не бросает: сбой реалтайма не должен ломать изменение.
 */
export async function publishRealtimeEvent(input: RealtimeEventInput): Promise<void> {
  const event = createRealtimeEvent(input);
  try {
    await prisma.$executeRaw`SELECT pg_notify(${REALTIME_CHANNEL}, ${encodeRealtimeEvent(event)})`;
    log.debug(
      {
        kind: event.kind,
        workspaceId: event.workspaceId,
        taskId: event.taskId,
        projects: event.projectIds.length,
      },
      '[realtime] published',
    );
  } catch (error) {
    log.warn(
      { err: error, kind: event.kind, workspaceId: event.workspaceId },
      '[realtime] publish failed',
    );
  }
}
