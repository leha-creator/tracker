// Публичный API модуля: MCP-сервер Tasker для AI-агентов (Claude Code) — `POST /api/mcp`.
// Зависимости: agent-mcp → api-tokens, tasks, projects, workspaces, integrations/github
// (через их index.ts); от agent-mcp никто не зависит.
export { handleMcpRequest, MCP_MAX_BODY_BYTES, methodNotAllowed } from './mcp-handler';
