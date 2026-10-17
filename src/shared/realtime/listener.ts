import 'server-only';

import { Client } from 'pg';

import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

import { createRealtimeHub, type RealtimeHub, type RealtimeListener } from './hub';

const log = createLogger('realtime');

// Singleton через globalThis: HMR в dev не плодит LISTEN-подключения.
const globalForRealtime = globalThis as unknown as { realtimeHub?: RealtimeHub };

function getRealtimeHub(): RealtimeHub {
  globalForRealtime.realtimeHub ??= createRealtimeHub({
    createClient: () => new Client({ connectionString: getEnv().DATABASE_URL }),
    log,
  });
  return globalForRealtime.realtimeHub;
}

/** Подписка на события пространства; возвращает функцию отписки. */
export function subscribeToWorkspace(workspaceId: string, listener: RealtimeListener): () => void {
  return getRealtimeHub().subscribe(workspaceId, listener);
}
