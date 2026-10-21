import { describe, expect, it } from 'vitest';

import {
  CONTEXT_TTL_SECONDS,
  escapeMarkdownInline,
  matchesOwner,
  parseActionItemDue,
  parseStoredActionItems,
  recapReadySchema,
  renderMeetingSummaryNote,
  signTaskContext,
  signWebhookBody,
  toStoredActionItems,
  verifyTaskContext,
  verifyWebhookSignature,
  type TaskContext,
} from '.';

const SECRET = 's'.repeat(32);
const NOW = 1_790_000_000;

const context: TaskContext = {
  v: 1,
  iss: 'tasker',
  aud: 'meet',
  jti: '0193a000-0000-7000-8000-000000000001',
  sub: 'sub-1',
  workspaceId: 'ws-1',
  workspaceName: 'Команда',
  taskId: '0193a000-0000-7000-8000-000000000002',
  taskKey: 'TSK-42',
  taskTitle: 'Макет главной',
  taskUrl: 'https://tracker.plwedding.ru/w/team/tasks/42',
  iat: NOW,
  exp: NOW + CONTEXT_TTL_SECONDS,
};

describe('task context token', () => {
  it('round-trips a signed context', () => {
    const token = signTaskContext(context, SECRET);
    expect(verifyTaskContext(token, SECRET, { now: NOW + 10, mode: 'link' })).toEqual({
      ok: true,
      context,
    });
  });

  it('rejects another secret, a tampered payload and garbage', () => {
    const token = signTaskContext(context, SECRET);
    expect(verifyTaskContext(token, 'x'.repeat(32), { now: NOW, mode: 'link' })).toEqual({
      ok: false,
      error: 'bad_signature',
    });
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...context, taskId: context.jti })).toString(
      'base64url',
    );
    expect(verifyTaskContext(`${forged}.${signature}`, SECRET, { now: NOW, mode: 'link' })).toEqual(
      { ok: false, error: 'bad_signature' },
    );
    expect(verifyTaskContext('abc', SECRET, { now: NOW, mode: 'link' })).toEqual({
      ok: false,
      error: 'malformed',
    });
    expect(verifyTaskContext('abc.!!', SECRET, { now: NOW, mode: 'link' })).toEqual({
      ok: false,
      error: 'bad_signature',
    });
  });

  it('checks the link expiry with clock skew and the webhook age', () => {
    const token = signTaskContext(context, SECRET);
    expect(verifyTaskContext(token, SECRET, { now: context.exp + 60, mode: 'link' }).ok).toBe(true);
    expect(verifyTaskContext(token, SECRET, { now: context.exp + 61, mode: 'link' })).toEqual({
      ok: false,
      error: 'expired',
    });
    expect(verifyTaskContext(token, SECRET, { now: NOW + 3600, mode: 'webhook' }).ok).toBe(true);
    expect(verifyTaskContext(token, SECRET, { now: NOW + 86_401, mode: 'webhook' })).toEqual({
      ok: false,
      error: 'too_old',
    });
  });

  it('truncates long names to the schema limits', () => {
    const token = signTaskContext({ ...context, taskTitle: 'я'.repeat(400) }, SECRET);
    const result = verifyTaskContext(token, SECRET, { now: NOW, mode: 'link' });
    expect(result.ok && result.context.taskTitle.length).toBe(300);
  });
});

describe('webhook signature', () => {
  const body = '{"meetingId":"m-1"}';

  it('accepts a fresh signature and any of several v1', () => {
    const header = signWebhookBody(body, SECRET, NOW);
    expect(verifyWebhookSignature(body, header, SECRET, NOW + 100)).toEqual({ ok: true });
    const rotated = `${header.replace('v1=', 'v1=00,v1=')}`;
    expect(verifyWebhookSignature(body, rotated, SECRET, NOW)).toEqual({ ok: true });
  });

  it('rejects stale, tampered and malformed headers', () => {
    const header = signWebhookBody(body, SECRET, NOW);
    expect(verifyWebhookSignature(body, header, SECRET, NOW + 301)).toEqual({
      ok: false,
      error: 'stale',
    });
    expect(verifyWebhookSignature(`${body} `, header, SECRET, NOW)).toEqual({
      ok: false,
      error: 'mismatch',
    });
    expect(verifyWebhookSignature(body, `t=${NOW},v1=zz`, SECRET, NOW)).toEqual({
      ok: false,
      error: 'mismatch',
    });
    for (const bad of [null, '', `v1=ab`, `t=abc,v1=ab`, 'garbage']) {
      expect(verifyWebhookSignature(body, bad, SECRET, NOW)).toEqual({
        ok: false,
        error: 'malformed',
      });
    }
  });
});

describe('recap.ready schema', () => {
  it('fills defaults and limits arrays', () => {
    const parsed = recapReadySchema.parse({
      meetingId: 'm-1',
      recapId: 'r-1',
      completedAt: '2026-10-21T13:05:00.000Z',
      summary: { overview: 'Итоги', actionItems: [{ task: 'Сделать', due: '2026-10-28' }] },
      transcript: 'не нужен',
    });
    expect(parsed.summary).toEqual({
      overview: 'Итоги',
      topics: [],
      decisions: [],
      actionItems: [{ owner: '', task: 'Сделать', due: '2026-10-28' }],
      openQuestions: [],
    });
    expect(
      recapReadySchema.safeParse({
        meetingId: 'm-1',
        recapId: 'r-1',
        completedAt: '2026-10-21T13:05:00.000Z',
        summary: { topics: Array.from({ length: 51 }, () => 'x') },
      }).success,
    ).toBe(false);
  });
});

describe('action items', () => {
  it('parses only real calendar dates', () => {
    expect(parseActionItemDue('2026-10-28')).toBe('2026-10-28');
    expect(parseActionItemDue('2026-10-28T12:00:00Z')).toBe('2026-10-28');
    expect(parseActionItemDue('2026-02-30')).toBeNull();
    expect(parseActionItemDue('завтра')).toBeNull();
    expect(parseActionItemDue(undefined)).toBeNull();
  });

  it('stores trimmed items without empty tasks', () => {
    expect(
      toStoredActionItems({
        overview: '',
        topics: [],
        decisions: [],
        openQuestions: [],
        actionItems: [
          { owner: ' Анна ', task: ' Макет ', due: 'потом' },
          { owner: '', task: '   ', due: null },
        ],
      }),
    ).toEqual([{ owner: 'Анна', task: 'Макет', due: null, subtaskId: null }]);
  });

  it('reads stored items defensively', () => {
    const items = [{ owner: 'А', task: 'Б', due: null, subtaskId: 't-1' }];
    expect(parseStoredActionItems(items)).toEqual(items);
    expect(parseStoredActionItems([{ task: 1 }])).toEqual([]);
    expect(parseStoredActionItems(null)).toEqual([]);
  });

  it('matches owners by name ignoring case and spaces', () => {
    expect(matchesOwner('анна  петрова', 'Анна Петрова')).toBe(true);
    expect(matchesOwner('Анна', 'Анна Петрова')).toBe(false);
    expect(matchesOwner(' ', '')).toBe(false);
  });
});

describe('renderMeetingSummaryNote', () => {
  const base = {
    taskKey: 'TSK-42',
    meetingUrl: 'https://meet.plwedding.ru/abc-defg-hij',
    completedAt: new Date('2026-10-21T22:30:00.000Z'),
    timeZone: 'Europe/Moscow',
  };

  it('renders sections, escapes markup and skips empty ones', () => {
    const { title, content } = renderMeetingSummaryNote({
      ...base,
      summary: {
        overview: 'Обсудили [ссылку](javascript:alert(1))\n\nВторой абзац',
        topics: ['<script>x</script>'],
        decisions: [],
        actionItems: [],
        openQuestions: ['# не заголовок'],
      },
      actionItems: [{ owner: 'Анна', task: 'Сделать *макет*', due: '2026-10-28', subtaskId: null }],
    });
    expect(title).toBe('Встреча 22 октября 2026 г. — TSK-42');
    expect(content).toContain('## Обзор');
    expect(content).toContain('Обсудили \\[ссылку\\]\\(javascript:alert\\(1\\)\\)');
    expect(content).toContain('- \\<script\\>x\\</script\\>');
    expect(content).not.toContain('## Решения');
    expect(content).toContain('- [ ] Сделать \\*макет\\* — Анна, до 28 октября');
    expect(content).toContain('- \\# не заголовок');
    expect(content).toContain('<https://meet.plwedding.ru/abc-defg-hij>');
  });

  it('says so when the summary is empty', () => {
    const { content } = renderMeetingSummaryNote({
      ...base,
      summary: { overview: ' ', topics: [], decisions: [], actionItems: [], openQuestions: [] },
      actionItems: [],
    });
    expect(content).toContain('Конспект пуст');
  });

  it('escapes inline markdown characters', () => {
    expect(escapeMarkdownInline('a_b\nc')).toBe('a\\_b c');
  });
});
