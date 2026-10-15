import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createRootLogger } from '@/shared/logger';

function createCapture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { lines, stream };
}

describe('createRootLogger', () => {
  it('writes structured JSON with scope from child logger', () => {
    const { lines, stream } = createCapture();
    const log = createRootLogger({ level: 'debug', pretty: false, destination: stream });

    log.child({ scope: 'tasks' }).info({ taskId: 't1' }, '[TaskService.create] created');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 30,
      app: 'tasker',
      scope: 'tasks',
      taskId: 't1',
      msg: '[TaskService.create] created',
    });
    expect(typeof lines[0]?.time).toBe('string');
  });

  it('redacts secrets', () => {
    const { lines, stream } = createCapture();
    const log = createRootLogger({ level: 'debug', pretty: false, destination: stream });

    log.info(
      {
        password: 'p@ss',
        user: { email: 'a@b.c', password: 'p@ss', token: 'tkn-123' },
        headers: { authorization: 'Bearer xyz', cookie: 'session=1' },
        credentials: { accessKeyId: 'AKIA', secretAccessKey: 'shh' },
      },
      'login attempt',
    );

    const raw = JSON.stringify(lines[0]);
    for (const secret of ['p@ss', 'tkn-123', 'Bearer xyz', 'session=1', 'AKIA', 'shh']) {
      expect(raw).not.toContain(secret);
    }
    expect(lines[0]).toMatchObject({ user: { email: 'a@b.c', password: '[REDACTED]' } });
  });

  it('respects log level', () => {
    const { lines, stream } = createCapture();
    const log = createRootLogger({ level: 'warn', pretty: false, destination: stream });

    log.debug('hidden');
    log.info('hidden');
    log.warn('visible');

    expect(lines.map((line) => line.msg)).toEqual(['visible']);
  });

  it('serializes errors with stack', () => {
    const { lines, stream } = createCapture();
    const log = createRootLogger({ level: 'debug', pretty: false, destination: stream });

    log.error({ err: new Error('boom') }, 'failed');

    expect(lines[0]).toMatchObject({ err: { type: 'Error', message: 'boom' } });
    expect((lines[0]?.err as { stack?: string }).stack).toContain('boom');
  });
});
