import 'server-only';

import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

import { actorOf, type McpContext } from './context';
import { buildServerInstructions, hasMcpScope, isToolAllowed, PROMPTS_SCOPE } from './models';
import { registerPrompts } from './prompts';
import { registerAttachmentTools } from './tools/attachment-tools';
import { registerDocumentReadTools } from './tools/document-tools';
import { registerDocumentWriteTools } from './tools/document-write-tools';
import { registerGithubTools } from './tools/github-tools';
import { registerReadTools } from './tools/read-tools';
import { registerWriteTools } from './tools/write-tools';

export const MCP_SERVER_INFO = { name: 'tasker', title: 'Tasker', version: '1.0.0' } as const;

/**
 * Инструменты вне областей токена не показываются агенту: каждый регистрируется и сразу
 * удаляется, если области нет (`tools/list` его не вернёт, вызов — «unknown tool»).
 * Так файлы инструментов не знают об областях, а карта TOOL_SCOPES — единственное место правил.
 */
function restrictToolsToScopes(server: McpServer, scopes: readonly string[]): void {
  // registerTool перегружен по схемам аргументов — вызываем исходный метод без перегрузок.
  const register = server.registerTool.bind(server) as (
    name: string,
    ...rest: unknown[]
  ) => RegisteredTool;
  const restricted = (name: string, ...rest: unknown[]): RegisteredTool => {
    const tool = register(name, ...rest);
    if (!isToolAllowed(name, scopes)) tool.remove();
    return tool;
  };
  server.registerTool = restricted as typeof server.registerTool;
}

/** Новый сервер на каждый запрос (stateless): инструменты замыкают контекст токена. */
export function createTaskerMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions: buildServerInstructions({
      workspaceName: ctx.workspace.name,
      taskKey: ctx.workspace.taskKey,
      actor: actorOf(ctx),
    }),
  });
  restrictToolsToScopes(server, ctx.via.scopes);
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerAttachmentTools(server, ctx);
  registerGithubTools(server, ctx);
  registerDocumentReadTools(server, ctx);
  registerDocumentWriteTools(server, ctx);
  if (hasMcpScope(ctx.via.scopes, PROMPTS_SCOPE)) registerPrompts(server, ctx);
  return server;
}
