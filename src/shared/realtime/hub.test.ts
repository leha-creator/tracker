import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRealtimeHub, retryDelayMs, type ListenClient, type RealtimeHub } from './hub';
import { createRealtimeEvent, encodeRealtimeEvent, REALTIME_CHANNEL } from './realtime-event';

class FakeClient extends EventEmitter implements ListenClient {
  connect = vi.fn(() => Promise.resolve());
  query = vi.fn(() => Promise.resolve());
  end = vi.fn(() => Promise.resolve());

  notify(workspaceId: string) {
    const payload = encodeRealtimeEvent(
      createRealtimeEvent({ workspaceId, kind: 'task.updated', projectIds: [], actorId: null }),
    );
    this.emit('notification', { channel: REALTIME_CHANNEL, payload });
  }
}

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let clients: FakeClient[];
let hub: RealtimeHub;

beforeEach(() => {
  vi.useFakeTimers();
  clients = [];
  hub = createRealtimeHub({
    createClient: () => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    },
    log,
    idleCloseMs: 1000,
  });
});

afterEach(async () => {
  await hub.close();
  vi.useRealTimers();
});

describe('createRealtimeHub', () => {
  it('connects lazily and dispatches by workspace', async () => {
    expect(clients).toHaveLength(0);
    const first = vi.fn();
    const second = vi.fn();
    hub.subscribe('ws-1', first);
    hub.subscribe('ws-2', second);
    await vi.advanceTimersByTimeAsync(0);
    expect(clients).toHaveLength(1);
    expect(clients[0]!.query).toHaveBeenCalledWith(`LISTEN ${REALTIME_CHANNEL}`);

    clients[0]!.notify('ws-1');
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe and closes the client when idle', async () => {
    const listener = vi.fn();
    const unsubscribe = hub.subscribe('ws-1', listener);
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    clients[0]!.notify('ws-1');
    expect(listener).not.toHaveBeenCalled();
    expect(hub.subscriberCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(clients[0]!.end).toHaveBeenCalled();
  });

  it('keeps the client when a new subscriber arrives before the idle timeout', async () => {
    hub.subscribe('ws-1', vi.fn())();
    await vi.advanceTimersByTimeAsync(500);
    hub.subscribe('ws-1', vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(clients[0]!.end).not.toHaveBeenCalled();
    expect(clients).toHaveLength(1);
  });

  it('reconnects after an error and broadcasts resync', async () => {
    const listener = vi.fn();
    hub.subscribe('ws-1', listener);
    await vi.advanceTimersByTimeAsync(0);

    clients[0]!.emit('error', new Error('connection reset'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(clients).toHaveLength(2);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: 'resync' }));
  });

  it('retries a failed connect with backoff', async () => {
    let attempt = 0;
    const failing = createRealtimeHub({
      createClient: () => {
        const client = new FakeClient();
        attempt += 1;
        if (attempt === 1) client.connect.mockRejectedValueOnce(new Error('refused'));
        clients.push(client);
        return client;
      },
      log,
    });
    failing.subscribe('ws-1', vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(attempt).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempt).toBe(2);
    await failing.close();
  });

  it('ignores malformed payloads and other channels', async () => {
    const listener = vi.fn();
    hub.subscribe('ws-1', listener);
    await vi.advanceTimersByTimeAsync(0);
    clients[0]!.emit('notification', { channel: REALTIME_CHANNEL, payload: '{' });
    clients[0]!.emit('notification', { channel: 'other', payload: '{}' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates a throwing listener', async () => {
    const good = vi.fn();
    hub.subscribe('ws-1', () => {
      throw new Error('boom');
    });
    hub.subscribe('ws-1', good);
    await vi.advanceTimersByTimeAsync(0);
    clients[0]!.notify('ws-1');
    expect(good).toHaveBeenCalledOnce();
  });
});

describe('retryDelayMs', () => {
  it('doubles up to the maximum', () => {
    expect([1, 2, 3, 4, 10].map((n) => retryDelayMs(n, 1000, 30_000))).toEqual([
      1000, 2000, 4000, 8000, 30_000,
    ]);
  });
});
