import type { ApiTokenContext } from '@/modules/api-tokens';

import type { McpActor } from './models';

/** Всё, что знает обработчик MCP-запроса: сессия и пространство токена, публичный адрес. */
export interface McpContext extends ApiTokenContext {
  /** BETTER_AUTH_URL — для ссылок на задачи. */
  baseUrl: string;
}

/** От чьего имени действует агент: агент пространства или человек по личному токену. */
export function actorOf(ctx: McpContext): McpActor {
  return {
    name: ctx.session.user.name,
    userId: ctx.session.user.id,
    tokenName: ctx.via.tokenName,
    scopes: ctx.via.scopes,
    agent: ctx.via.agent ? { responsibleName: ctx.via.agent.responsibleName } : null,
  };
}
