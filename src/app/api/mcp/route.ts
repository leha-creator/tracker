import { handleMcpRequest, methodNotAllowed } from '@/modules/agent-mcp';

/**
 * MCP-сервер для AI-агентов (Streamable HTTP, без сессий). Доступ — личный токен
 * `Authorization: Bearer tkr_…` из профиля; proxy `/api` не трогает.
 */
export function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export function GET(): Response {
  return methodNotAllowed();
}

export function DELETE(): Response {
  return methodNotAllowed();
}
