import type { Logger } from 'pino';

import {
  createRealtimeEvent,
  parseRealtimeEvent,
  REALTIME_CHANNEL,
  type RealtimeEvent,
} from './realtime-event';

/**
 * Раздача событий подписчикам процесса. Один клиент Postgres делает `LISTEN` и получает события
 * всех пространств; подписчики фильтруются по `workspaceId` в памяти. Клиент поднимается при
 * первой подписке, после обрыва переподключается и рассылает `resync` (события за время обрыва
 * потеряны), а без подписчиков закрывается.
 */

/** Минимум клиента `pg`, нужный хабу (упрощает тесты). */
export interface ListenClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
  on(
    event: 'notification',
    listener: (message: { channel: string; payload?: string }) => void,
  ): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  removeAllListeners(): unknown;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeHubOptions {
  createClient: () => ListenClient;
  log: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
  /** Через сколько закрыть клиент, когда подписчиков не осталось. */
  idleCloseMs?: number;
  retryMinMs?: number;
  retryMaxMs?: number;
}

export const DEFAULT_IDLE_CLOSE_MS = 60_000;
const DEFAULT_RETRY_MIN_MS = 1_000;
const DEFAULT_RETRY_MAX_MS = 30_000;
/** После стольких неудач подряд — ERROR в логе (попытки продолжаются). */
const RETRY_ERROR_THRESHOLD = 10;

/** Задержка переподключения: 1, 2, 4… секунд, не больше максимума. */
export function retryDelayMs(attempt: number, minMs: number, maxMs: number): number {
  return Math.min(maxMs, minMs * 2 ** Math.max(0, attempt - 1));
}

export interface RealtimeHub {
  subscribe(workspaceId: string, listener: RealtimeListener): () => void;
  subscriberCount(): number;
  /** Закрыть клиент и снять таймеры (тесты, остановка процесса). */
  close(): Promise<void>;
}

export function createRealtimeHub(options: RealtimeHubOptions): RealtimeHub {
  const { createClient, log } = options;
  const idleCloseMs = options.idleCloseMs ?? DEFAULT_IDLE_CLOSE_MS;
  const retryMinMs = options.retryMinMs ?? DEFAULT_RETRY_MIN_MS;
  const retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;

  const listeners = new Map<string, Set<RealtimeListener>>();
  let client: ListenClient | null = null;
  let connecting: Promise<void> | null = null;
  let failures = 0;
  let wasConnected = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const subscriberCount = () => {
    let count = 0;
    for (const set of listeners.values()) count += set.size;
    return count;
  };

  function dispatch(event: RealtimeEvent) {
    const set = listeners.get(event.workspaceId);
    log.debug(
      { kind: event.kind, workspaceId: event.workspaceId, subscribers: set?.size ?? 0 },
      '[realtime] dispatched',
    );
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (error) {
        log.warn({ err: error, workspaceId: event.workspaceId }, '[realtime] listener failed');
      }
    }
  }

  /** После обрыва события потеряны — все подписчики обновляются. */
  function broadcastResync() {
    for (const workspaceId of listeners.keys()) {
      dispatch(createRealtimeEvent({ workspaceId, kind: 'resync', projectIds: [], actorId: null }));
    }
  }

  function scheduleRetry() {
    if (closed || retryTimer || subscriberCount() === 0) return;
    failures += 1;
    const delay = retryDelayMs(failures, retryMinMs, retryMaxMs);
    const level = failures >= RETRY_ERROR_THRESHOLD ? 'error' : 'warn';
    log[level]({ failures, delayMs: delay }, `[realtime] listener lost, retry in ${delay}ms`);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  }

  function dropClient(current: ListenClient) {
    if (client !== current) return;
    client = null;
    current.removeAllListeners();
    // Ошибки закрытия уже оборванного соединения не интересны.
    current.end().catch(() => undefined);
  }

  function connect(): Promise<void> {
    if (client || closed) return Promise.resolve();
    connecting ??= (async () => {
      const next = createClient();
      next.on('notification', (message) => {
        if (message.channel !== REALTIME_CHANNEL || !message.payload) return;
        const event = parseRealtimeEvent(message.payload);
        if (!event) {
          log.warn('[realtime] malformed event skipped');
          return;
        }
        dispatch(event);
      });
      next.on('error', (error) => {
        log.warn({ err: error }, '[realtime] listener error');
        dropClient(next);
        scheduleRetry();
      });
      next.on('end', () => {
        if (client !== next) return;
        dropClient(next);
        scheduleRetry();
      });
      try {
        await next.connect();
        await next.query(`LISTEN ${REALTIME_CHANNEL}`);
      } catch (error) {
        log.warn({ err: error }, '[realtime] listener connect failed');
        next.removeAllListeners();
        next.end().catch(() => undefined);
        scheduleRetry();
        return;
      }
      if (closed) {
        next.removeAllListeners();
        await next.end().catch(() => undefined);
        return;
      }
      client = next;
      const reconnected = wasConnected;
      wasConnected = true;
      failures = 0;
      log.info(
        { subscribers: subscriberCount() },
        reconnected ? '[realtime] listener reconnected' : '[realtime] listener connected',
      );
      if (reconnected) broadcastResync();
    })().finally(() => {
      connecting = null;
    });
    return connecting;
  }

  function scheduleIdleClose() {
    if (idleTimer || subscriberCount() > 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (subscriberCount() > 0) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (client) {
        log.info('[realtime] listener closed: no subscribers');
        dropClient(client);
      }
      wasConnected = false;
      failures = 0;
    }, idleCloseMs);
  }

  return {
    subscribe(workspaceId, listener) {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      let set = listeners.get(workspaceId);
      if (!set) {
        set = new Set();
        listeners.set(workspaceId, set);
      }
      set.add(listener);
      void connect();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const current = listeners.get(workspaceId);
        current?.delete(listener);
        if (current?.size === 0) listeners.delete(workspaceId);
        scheduleIdleClose();
      };
    },
    subscriberCount,
    async close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (idleTimer) clearTimeout(idleTimer);
      retryTimer = idleTimer = null;
      listeners.clear();
      await connecting?.catch(() => undefined);
      if (client) {
        const current = client;
        client = null;
        current.removeAllListeners();
        await current.end().catch(() => undefined);
      }
    },
  };
}
