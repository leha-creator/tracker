import 'server-only';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpContext } from './context';
import { buildServerInstructions } from './models';
import { registerPrompts } from './prompts';
import { registerAttachmentTools } from './tools/attachment-tools';
import { registerGithubTools } from './tools/github-tools';
import { registerReadTools } from './tools/read-tools';
import { registerWriteTools } from './tools/write-tools';

export const MCP_SERVER_INFO = { name: 'tasker', title: 'Tasker', version: '1.0.0' } as const;

/** Новый сервер на каждый запрос (stateless): инструменты замыкают контекст токена. */
export function createTaskerMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions: buildServerInstructions({
      workspaceName: ctx.workspace.name,
      taskKey: ctx.workspace.taskKey,
    }),
  });
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerAttachmentTools(server, ctx);
  registerGithubTools(server, ctx);
  registerPrompts(server, ctx);
  return server;
}
