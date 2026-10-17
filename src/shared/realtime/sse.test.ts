import { beforeEach, describe, expect, it, vi } from 'vitest';

const unsubscribe = vi.fn();
let listener: ((event: unknown) => void) | null = null;
vi.mock('./listener', () => ({
  subscribeToWorkspace: (_workspaceId: string, fn: (event: unknown) => void) => {
    listener = fn;
    return unsubscribe;
  },
}));

const {
  acquireSseConnection,
  createConnectionCounter,
  createWorkspaceEventStream,
  formatSseComment,
  formatSseEvent,
  SSE_MAX_CONNECTIONS_PER_USER,
} = await import('./sse');

beforeEach(() => {
  vi.clearAllMocks();
  listener = null;
});

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
  }
}

describe('formatSseEvent / formatSseComment', () => {
  it('formats frames', () => {
    expect(formatSseEvent('task', { a: 1 })).toBe('event: task\ndata: {"a":1}\n\n');
    expect(formatSseComment('ping')).toBe(': ping\n\n');
  });
});

describe('createConnectionCounter', () => {
  it('limits connections per user and frees slots', () => {
    const counter = createConnectionCounter(2);
    expect(counter.acquire('u')).toBe(true);
    expect(counter.acquire('u')).toBe(true);
    expect(counter.acquire('u')).toBe(false);
    expect(counter.acquire('v')).toBe(true);
    counter.release('u');
    expect(counter.count('u')).toBe(1);
    expect(counter.acquire('u')).toBe(true);
  });
});

describe('createWorkspaceEventStream', () => {
  it('sends ready and events, then releases the slot on abort', async () => {
    const userId = 'user-stream';
    for (let i = 0; i < SSE_MAX_CONNECTIONS_PER_USER; i += 1) {
      expect(acquireSseConnection(userId)).toBe(true);
    }
    expect(acquireSseConnection(userId)).toBe(false);

    const controller = new AbortController();
    const stream = createWorkspaceEventStream({
      workspaceId: 'ws-1',
      userId,
      signal: controller.signal,
      recheckAccess: () => Promise.resolve(true),
    });
    const text = readAll(stream);
    listener?.({ kind: 'task.updated' });
    controller.abort();

    const output = await text;
    expect(output).toContain('retry: 5000');
    expect(output).toContain('event: ready');
    expect(output).toContain('event: task\ndata: {"kind":"task.updated"}');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(acquireSseConnection(userId)).toBe(true);
  });
});
