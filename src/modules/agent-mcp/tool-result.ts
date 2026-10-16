import 'server-only';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { recordActivity } from '@/modules/api-tokens';
import { AppError, ForbiddenError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import type { McpContext } from './context';
import { isToolAllowed, scopeDeniedMessage, TOOL_SCOPES, type McpToolName } from './models';

const log = createLogger('mcp');

const INTERNAL_MESSAGE = 'Внутренняя ошибка Tasker. Попробуйте ещё раз или сообщите пользователю.';

/** Что записать в журнал действий после успешного изменения (McpActivity). */
export interface ToolActivity {
  /** Готовая строка для людей: «Перевёл TSK-42: К выполнению → В работе». */
  summary: string;
  /** Ключ задачи или id документа. */
  targetKey: string | null;
}

/** Ответ инструмента: текст агенту и, для изменений, запись журнала. */
export type ToolOutput = string | { text: string; activity?: ToolActivity | null };

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

export function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function appErrorText(error: AppError): string {
  const fields = Object.entries(error.fieldErrors ?? {})
    .map(([field, messages]) => `${field}: ${messages.join(' ')}`)
    .join('; ');
  return fields ? `${error.message} (${fields})` : error.message;
}

/**
 * Обёртка обработчика инструмента: логирует вызов и длительность, ошибки домена отдаёт
 * агенту текстом (`isError`), чтобы он мог исправить аргументы. Неожиданные — общий текст.
 */
export async function runTool(
  ctx: McpContext,
  tool: McpToolName,
  handler: () => Promise<ToolOutput>,
): Promise<CallToolResult> {
  const started = performance.now();
  const meta = { tool, tokenId: ctx.tokenId, workspaceId: ctx.workspace.id };
  log.debug(meta, '[mcp.tool] call');
  try {
    // Вторая линия обороны: инструменты вне областей токена и так не регистрируются (server.ts).
    if (!isToolAllowed(tool, ctx.via.scopes)) {
      log.warn({ ...meta, scope: TOOL_SCOPES[tool] }, '[mcp.tool] scope denied');
      throw new ForbiddenError(scopeDeniedMessage(tool));
    }
    const output = await handler();
    const text = typeof output === 'string' ? output : output.text;
    const activity = typeof output === 'string' ? null : (output.activity ?? null);
    if (activity) {
      // Без ожидания: журнал не задерживает ответ и не ломает его (recordActivity не бросает).
      void recordActivity({
        workspaceId: ctx.workspace.id,
        userId: ctx.session.user.id,
        tokenId: ctx.tokenId,
        tool,
        summary: activity.summary,
        targetKey: activity.targetKey,
      }).catch((error: unknown) =>
        log.warn({ ...meta, err: error }, '[mcp.activity] record failed'),
      );
    }
    log.debug({ ...meta, durationMs: Math.round(performance.now() - started) }, '[mcp.tool] done');
    return textResult(text);
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    if (error instanceof AppError && error.expose) {
      log.warn({ ...meta, code: error.code, durationMs }, '[mcp.tool] rejected');
      return errorResult(appErrorText(error));
    }
    log.error({ ...meta, err: error, durationMs }, '[mcp.tool] failed');
    return errorResult(INTERNAL_MESSAGE);
  }
}
