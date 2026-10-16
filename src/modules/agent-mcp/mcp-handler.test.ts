import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiTokenContext } from '@/modules/api-tokens';
import type * as ApiTokensModule from '@/modules/api-tokens';
import { UnauthorizedError } from '@/shared/errors';

const authenticateApiToken = vi.fn<(header: string | null) => Promise<ApiTokenContext>>();

vi.mock('@/modules/api-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiTokensModule>()),
  authenticateApiToken: (header: string | null) => authenticateApiToken(header),
}));

const { handleMcpRequest, MCP_MAX_BODY_BYTES, methodNotAllowed } = await import('./mcp-handler');

const auth: ApiTokenContext = {
  session: {
    user: {
      id: 'u-1',
      email: 'a@example.com',
      name: 'Анна',
      image: null,
      role: 'user',
      banned: false,
    },
    session: { id: 'api-token:t-1', expiresAt: new Date('2030-01-01') },
  },
  workspace: { id: 'ws-1', slug: 'team', name: 'Команда', taskKey: 'TSK' },
  tokenId: 't-1',
  tokenPrefix: 'tkr_abcdefgh',
};

function rpc(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/mcp', {
    method: 'POST',
    headers: {
      authorization: 'Bearer tkr_test',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

interface RpcResponse {
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateApiToken.mockResolvedValue(auth);
});

describe('POST /api/mcp', () => {
  it('без токена — 401 с WWW-Authenticate и JSON-RPC ошибкой', async () => {
    authenticateApiToken.mockRejectedValue(new UnauthorizedError('Недействительный токен доступа'));
    const response = await handleMcpRequest(rpc({}, { authorization: '' }));

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
    const body = (await response.json()) as RpcResponse;
    expect(body.error?.message).toBe('Недействительный токен доступа');
  });

  it('initialize отдаёт инструкции с ключом пространства', async () => {
    const response = await handleMcpRequest(
      rpc({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as RpcResponse;
    expect(body.result?.serverInfo).toMatchObject({ name: 'tasker' });
    expect(body.result?.instructions).toContain('TSK-42');
    expect(authenticateApiToken).toHaveBeenCalledWith('Bearer tkr_test');
  });

  it('tools/list и prompts/list — все инструменты и сценарии', async () => {
    const tools = (await (
      await handleMcpRequest(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))
    ).json()) as { result: { tools: { name: string }[] } };
    expect(tools.result.tools.map((tool) => tool.name).sort()).toEqual([
      'add_comment',
      'create_task',
      'get_github_conventions',
      'get_task',
      'get_workspace_context',
      'list_tasks',
      'preview_github_links',
      'set_task_parent',
      'set_task_status',
      'update_task',
    ]);

    const prompts = (await (
      await handleMcpRequest(rpc({ jsonrpc: '2.0', id: 3, method: 'prompts/list' }))
    ).json()) as { result: { prompts: { name: string }[] } };
    expect(prompts.result.prompts.map((prompt) => prompt.name)).toEqual([
      'start_task',
      'finish_task',
    ]);
  });

  it('слишком большое тело — 413', async () => {
    const response = await handleMcpRequest(
      rpc('x'.repeat(MCP_MAX_BODY_BYTES + 1), {
        'content-length': String(MCP_MAX_BODY_BYTES + 1),
      }),
    );
    expect(response.status).toBe(413);
  });
});

describe('GET и DELETE /api/mcp', () => {
  it('405 с Allow: POST', () => {
    const response = methodNotAllowed();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});
