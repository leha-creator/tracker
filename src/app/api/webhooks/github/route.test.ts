import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleGithubWebhook = vi.fn<(input: unknown) => Promise<string>>();
const verifySignature = vi.fn<(body: string, header: string | null) => boolean>();
let enabled = true;

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/modules/integrations/github', () => ({
  isGithubEnabled: () => enabled,
  verifyGithubWebhookSignature: (body: string, header: string | null) =>
    verifySignature(body, header),
  handleGithubWebhook: (input: unknown) => handleGithubWebhook(input),
}));

const { POST } = await import('./route');

const DELIVERY = '72d3162e-cc78-11e3-81ab-4c9367dc0958';

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/webhooks/github', {
    method: 'POST',
    body,
    headers: {
      'x-github-event': 'installation',
      'x-github-delivery': DELIVERY,
      'x-hub-signature-256': 'sha256=abc',
      ...headers,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  enabled = true;
  verifySignature.mockReturnValue(true);
  handleGithubWebhook.mockResolvedValue('handled');
});

describe('POST /api/webhooks/github', () => {
  it('is 404 when GitHub is not configured', async () => {
    enabled = false;
    expect((await POST(request('{}'))).status).toBe(404);
  });

  it('rejects oversized payloads before checking signature', async () => {
    const response = await POST(request('{}', { 'content-length': String(11 * 1024 * 1024) }));
    expect(response.status).toBe(413);
    expect(verifySignature).not.toHaveBeenCalled();
  });

  it('rejects invalid signature without parsing', async () => {
    verifySignature.mockReturnValue(false);
    const response = await POST(request('not json'));
    expect(response.status).toBe(401);
    expect(handleGithubWebhook).not.toHaveBeenCalled();
  });

  it('verifies signature against the raw body', async () => {
    await POST(request('{"a": 1}'));
    expect(verifySignature).toHaveBeenCalledWith('{"a": 1}', 'sha256=abc');
  });

  it.each([[{ 'x-github-event': 'Bad Event' }], [{ 'x-github-delivery': 'nope' }]])(
    'rejects invalid headers %j',
    async (headers) => {
      expect((await POST(request('{}', headers))).status).toBe(400);
    },
  );

  it('rejects invalid JSON after signature check', async () => {
    expect((await POST(request('{oops'))).status).toBe(400);
  });

  it('passes event, delivery and payload to the handler', async () => {
    const response = await POST(request('{"action":"created"}'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: 'handled' });
    expect(handleGithubWebhook).toHaveBeenCalledWith({
      event: 'installation',
      deliveryId: DELIVERY,
      payload: { action: 'created' },
    });
  });

  it('answers 500 when handling fails (GitHub can redeliver)', async () => {
    handleGithubWebhook.mockRejectedValue(new Error('db down'));
    expect((await POST(request('{}'))).status).toBe(500);
  });
});
