import 'server-only';

import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { apiTokenRepository } from '../token/token.repository';
import type { McpActivityDto, McpActivityPageDto } from './activity.dto';
import { activityRepository, type McpActivityRow } from './activity.repository';
import {
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_RETENTION_DAYS,
  encodeActivityCursor,
  type ActivityCursor,
} from './activity.schema';

const log = createLogger('api-tokens');

/** Доля записей, после которых чистятся старые (как доставки вебхуков GitHub). */
const PURGE_PROBABILITY = 0.01;
const RETENTION_MS = ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface RecordActivityInput {
  workspaceId: string;
  userId: string;
  tokenId: string;
  tool: string;
  summary: string;
  targetKey: string | null;
}

/**
 * Запись в журнал после успешного изменения через MCP. Никогда не бросает: сбой журнала не
 * должен влиять на ответ агенту. Изредка удаляет записи старше 90 дней.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    await activityRepository.create(input);
    log.debug({ tool: input.tool, tokenId: input.tokenId }, '[mcp.activity] recorded');
  } catch (error) {
    log.warn(
      { err: error, tool: input.tool, tokenId: input.tokenId },
      '[mcp.activity] record failed',
    );
    return;
  }
  if (Math.random() < PURGE_PROBABILITY) {
    const purged = await activityRepository
      .deleteOlderThan(new Date(Date.now() - RETENTION_MS))
      .catch((error: unknown) => {
        log.warn({ err: error }, '[mcp.activity] purge failed');
        return 0;
      });
    log.debug({ purged }, '[mcp.activity] old records purged');
  }
}

function toPage(rows: McpActivityRow[], take: number): McpActivityPageDto {
  const items: McpActivityDto[] = rows.slice(0, take).map((row) => ({
    id: row.id,
    tool: row.tool,
    summary: row.summary,
    targetKey: row.targetKey,
    tokenName: row.token?.name ?? null,
    createdAt: row.createdAt,
  }));
  const last = items.at(-1);
  return { items, nextCursor: rows.length > take && last ? encodeActivityCursor(last) : null };
}

/** Журнал агента — только владелец пространства агента. */
export async function listAgentActivity(
  session: AuthSession,
  workspaceId: string,
  agentId: string,
  cursor: ActivityCursor | null = null,
): Promise<McpActivityPageDto> {
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  const agent = await apiTokenRepository.findAgent(agentId);
  if (!agent || agent.workspaceId !== workspaceId) {
    log.warn({ userId: session.user.id, workspaceId, agentId }, '[mcp.activity] agent not found');
    throw new NotFoundError('Агент не найден');
  }
  const rows = await activityRepository.listForUser(
    workspaceId,
    agentId,
    cursor,
    ACTIVITY_PAGE_SIZE + 1,
  );
  log.debug({ workspaceId, agentId, count: rows.length }, '[mcp.activity.listAgent]');
  return toPage(rows, ACTIVITY_PAGE_SIZE);
}

/** Журнал личного токена — только его владелец. Чужой или токен агента — NOT_FOUND. */
export async function listTokenActivity(
  session: AuthSession,
  tokenId: string,
  cursor: ActivityCursor | null = null,
): Promise<{
  token: { id: string; name: string; workspace: { id: string; slug: string; name: string } };
  page: McpActivityPageDto;
}> {
  const token = await activityRepository.findToken(tokenId);
  if (!token || token.userId !== session.user.id) {
    log.warn({ userId: session.user.id, tokenId }, '[mcp.activity] token not found');
    throw new NotFoundError('Токен не найден');
  }
  const rows = await activityRepository.listForToken(tokenId, cursor, ACTIVITY_PAGE_SIZE + 1);
  log.debug({ tokenId, count: rows.length }, '[mcp.activity.listToken]');
  return {
    token: { id: token.id, name: token.name, workspace: token.workspace },
    page: toPage(rows, ACTIVITY_PAGE_SIZE),
  };
}
