import 'server-only';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { AppError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import type { McpContext } from './context';

const log = createLogger('mcp');

const INTERNAL_MESSAGE = 'Внутренняя ошибка Tasker. Попробуйте ещё раз или сообщите пользователю.';

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
  tool: string,
  handler: () => Promise<string>,
): Promise<CallToolResult> {
  const started = performance.now();
  const meta = { tool, tokenId: ctx.tokenId, workspaceId: ctx.workspace.id };
  log.debug(meta, '[mcp.tool] call');
  try {
    const text = await handler();
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
