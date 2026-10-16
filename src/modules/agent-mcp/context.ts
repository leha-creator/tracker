import type { ApiTokenContext } from '@/modules/api-tokens';

/** Всё, что знает обработчик MCP-запроса: сессия и пространство токена, публичный адрес. */
export interface McpContext extends ApiTokenContext {
  /** BETTER_AUTH_URL — для ссылок на задачи. */
  baseUrl: string;
}
