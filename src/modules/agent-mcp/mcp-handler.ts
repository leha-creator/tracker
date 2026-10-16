import 'server-only';

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { authenticateApiToken, type ApiTokenContext } from '@/modules/api-tokens';
import { toErrorResponse, UnauthorizedError } from '@/shared/errors';
import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

import { createTaskerMcpServer } from './server';

const log = createLogger('mcp');

/** Тело JSON-RPC запроса агента: аргументы инструментов небольшие, 1 МБ с запасом. */
export const MCP_MAX_BODY_BYTES = 1024 * 1024;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** 401 по спецификации MCP: JSON-RPC ошибка и `WWW-Authenticate: Bearer`. */
function unauthorized(message: string): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32001, message }, id: null },
    {
      status: 401,
      headers: {
        ...NO_STORE,
        'WWW-Authenticate': 'Bearer realm="tasker", error="invalid_token"',
      },
    },
  );
}

/**
 * `POST /api/mcp`: токен → сессия владельца → новый MCP-сервер и транспорт без сессий
 * (ответ — JSON, без SSE). Так запрос может прийти на любую реплику за прокси.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  let auth: ApiTokenContext;
  try {
    auth = await authenticateApiToken(request.headers.get('authorization'));
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized(error.message);
    return toErrorResponse(error, { route: 'POST /api/mcp' });
  }

  const ctx = { ...auth, baseUrl: getEnv().BETTER_AUTH_URL };
  log.debug(
    { tokenId: ctx.tokenId, workspaceId: ctx.workspace.id, method: request.method },
    '[mcp.request]',
  );

  const server = createTaskerMcpServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MCP_MAX_BODY_BYTES,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return toErrorResponse(error, { route: 'POST /api/mcp', tokenId: ctx.tokenId });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

/** GET (SSE-поток) и DELETE (закрытие сессии) не нужны: сервер без сессий. */
export function methodNotAllowed(): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null },
    { status: 405, headers: { ...NO_STORE, Allow: 'POST' } },
  );
}
