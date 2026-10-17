import 'server-only';

import { createLogger } from '@/shared/logger';

import { subscribeToWorkspace } from './listener';
import type { RealtimeEvent } from './realtime-event';

const log = createLogger('realtime.sse');

/** Не больше стольких SSE-соединений на пользователя в процессе (вкладки, окна). */
export const SSE_MAX_CONNECTIONS_PER_USER = 6;
/** Heartbeat держит соединение через прокси и замечает закрытые вкладки. */
export const SSE_HEARTBEAT_MS = 25_000;
/** Как часто перепроверять доступ к пространству (исключили из участников — поток закрывается). */
export const SSE_RECHECK_ACCESS_MS = 5 * 60_000;
/** Через сколько браузер переподключается после обрыва. */
export const SSE_RETRY_MS = 5_000;

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const;

/** Кадр события SSE; `data` — одна строка JSON. */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Комментарий SSE (heartbeat), клиент его не видит. */
export function formatSseComment(text: string): string {
  return `: ${text}\n\n`;
}

/** Счётчик соединений по пользователю. */
export function createConnectionCounter(limit: number) {
  const counts = new Map<string, number>();
  return {
    /** Занять слот; false — лимит исчерпан. */
    acquire(userId: string): boolean {
      const current = counts.get(userId) ?? 0;
      if (current >= limit) return false;
      counts.set(userId, current + 1);
      return true;
    },
    release(userId: string): void {
      const current = counts.get(userId) ?? 0;
      if (current <= 1) counts.delete(userId);
      else counts.set(userId, current - 1);
    },
    count(userId: string): number {
      return counts.get(userId) ?? 0;
    },
  };
}

// Singleton через globalThis: HMR в dev не обнуляет счётчик открытых соединений.
const globalForSse = globalThis as unknown as {
  sseConnections?: ReturnType<typeof createConnectionCounter>;
};
const connections = (globalForSse.sseConnections ??= createConnectionCounter(
  SSE_MAX_CONNECTIONS_PER_USER,
));

export function acquireSseConnection(userId: string): boolean {
  return connections.acquire(userId);
}

export interface WorkspaceEventStreamInput {
  workspaceId: string;
  userId: string;
  signal: AbortSignal;
  /** Доступ ещё есть? Ошибка проверки считается потерей доступа. */
  recheckAccess: () => Promise<boolean>;
}

/**
 * Поток событий пространства. Слот соединения должен быть занят заранее (`acquireSseConnection`),
 * поток освобождает его при закрытии.
 */
export function createWorkspaceEventStream(
  input: WorkspaceEventStreamInput,
): ReadableStream<Uint8Array> {
  const { workspaceId, userId, signal, recheckAccess } = input;
  const encoder = new TextEncoder();
  const openedAt = Date.now();
  let cleanup: (() => void) | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      const unsubscribe = subscribeToWorkspace(workspaceId, (event: RealtimeEvent) => {
        send(formatSseEvent('task', event));
      });
      const heartbeat = setInterval(() => send(formatSseComment('ping')), SSE_HEARTBEAT_MS);
      const recheck = setInterval(() => {
        void recheckAccess()
          .catch(() => false)
          .then((allowed) => {
            if (allowed || closed) return;
            log.warn({ workspaceId, userId }, '[realtime.sse] revoked');
            send(formatSseEvent('revoked', {}));
            close();
          });
      }, SSE_RECHECK_ACCESS_MS);

      function close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(recheck);
        unsubscribe();
        signal.removeEventListener('abort', close);
        connections.release(userId);
        log.debug(
          {
            workspaceId,
            userId,
            durationMs: Date.now() - openedAt,
            connections: connections.count(userId),
          },
          '[realtime.sse] close',
        );
        try {
          controller.close();
        } catch {
          // Поток уже закрыт клиентом.
        }
      }
      cleanup = close;

      signal.addEventListener('abort', close);
      if (signal.aborted) {
        close();
        return;
      }
      send(`retry: ${SSE_RETRY_MS}\n\n`);
      send(formatSseEvent('ready', { at: openedAt }));
      log.debug(
        { workspaceId, userId, connections: connections.count(userId) },
        '[realtime.sse] open',
      );
    },
    cancel() {
      cleanup?.();
    },
  });
}
