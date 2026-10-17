import 'server-only';

import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession, AuthVia } from '@/shared/auth';
import { NotFoundError, UnauthorizedError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  API_TOKEN_TOUCH_INTERVAL_MS,
  API_TOKENS_PER_USER_LIMIT,
  apiTokenState,
  expiryToDate,
  generateApiToken,
  hashApiToken,
  normalizeScopes,
  parseBearer,
  shouldTouchApiToken,
  type ApiTokenScope,
} from '../../models';
import type { ApiTokenDto, CreatedApiTokenDto } from './token.dto';
import { apiTokenRepository, type ApiTokenRow } from './token.repository';
import type { CreateAgentTokenInput, CreateApiTokenInput } from './token.schema';

const log = createLogger('api-tokens');

/** Одно сообщение на все причины отказа: не подсказываем, что именно не так с токеном. */
const INVALID_TOKEN_MESSAGE = 'Недействительный токен доступа';

/** Подтверждённый токен: синтетическая сессия владельца и пространство токена. */
export interface ApiTokenContext {
  session: AuthSession;
  workspace: { id: string; slug: string; name: string; taskKey: string | null };
  tokenId: string;
  tokenPrefix: string;
  /** То же, что `session.via`: название, области и агент токена. */
  via: AuthVia;
}

type RejectReason =
  | 'malformed'
  | 'unknown'
  | 'revoked'
  | 'expired'
  | 'banned'
  | 'not_member'
  | 'agent_disabled'
  | 'workspace_archived';

function reject(reason: RejectReason, tokenId?: string): UnauthorizedError {
  log.warn({ reason, tokenId }, '[api-token.authenticate] rejected');
  return new UnauthorizedError(INVALID_TOKEN_MESSAGE);
}

function toDto(row: ApiTokenRow, now: Date): ApiTokenDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: normalizeScopes(row.scopes),
    workspace: row.workspace,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    state: apiTokenState(row, now),
  };
}

/** Выпуск: лимит действующих токенов владельца, хеш в БД, открытый токен — один раз. */
async function issueToken(input: {
  userId: string;
  issuedById: string;
  workspaceId: string;
  name: string;
  expiry: CreateApiTokenInput['expiry'];
  scopes: ApiTokenScope[];
}): Promise<CreatedApiTokenDto> {
  const now = new Date();
  const active = await apiTokenRepository.countActive(input.userId, now);
  if (active >= API_TOKENS_PER_USER_LIMIT) {
    log.warn({ userId: input.userId, active }, '[api-token.create] limit reached');
    throw new ValidationError(
      `Не больше ${API_TOKENS_PER_USER_LIMIT} действующих токенов. Отзовите ненужные.`,
    );
  }

  const { token, prefix, hash } = generateApiToken();
  const row = await apiTokenRepository.create({
    userId: input.userId,
    issuedById: input.issuedById,
    workspaceId: input.workspaceId,
    name: input.name,
    prefix,
    tokenHash: hash,
    scopes: input.scopes,
    expiresAt: expiryToDate(input.expiry, now),
  });
  return { token: toDto(row, now), secret: token };
}

/** Выпускает личный токен для пространства, где пользователь — участник. */
export async function createApiToken(
  session: AuthSession,
  input: CreateApiTokenInput,
): Promise<CreatedApiTokenDto> {
  const userId = session.user.id;
  const { workspaceId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  const scopes = normalizeScopes(input.scopes);
  log.debug({ userId, workspaceId, expiry: input.expiry, scopes }, '[api-token.create] start');

  const created = await issueToken({ ...input, userId, issuedById: userId, scopes });
  log.info(
    { tokenId: created.token.id, userId, workspaceId, prefix: created.token.prefix, scopes },
    '[api-token] created',
  );
  return created;
}

export async function listMyApiTokens(session: AuthSession): Promise<ApiTokenDto[]> {
  const userId = session.user.id;
  const rows = await apiTokenRepository.listForUser(userId);
  log.debug({ userId, count: rows.length }, '[api-token.listMine]');
  const now = new Date();
  return rows.map((row) => toDto(row, now));
}

/** Отзывает свой токен. Чужой — NOT_FOUND, повторный отзыв ничего не меняет. */
export async function revokeApiToken(session: AuthSession, tokenId: string): Promise<void> {
  const userId = session.user.id;
  const row = await apiTokenRepository.findOwned(userId, tokenId);
  if (!row) {
    log.warn({ userId, tokenId }, '[api-token.revoke] not found');
    throw new NotFoundError('Токен не найден');
  }
  if (row.revokedAt) {
    log.debug({ userId, tokenId }, '[api-token.revoke] already revoked');
    return;
  }
  const revoked = await apiTokenRepository.revoke(tokenId, new Date());
  log.info({ tokenId, userId, workspaceId: row.workspaceId, revoked }, '[api-token] revoked');
}

/**
 * Агент этого пространства и проверка, что смотрящий — его владелец. Агент другого пространства
 * или не агент — NOT_FOUND (не раскрываем), не владелец — FORBIDDEN.
 */
async function requireAgentOwner(session: AuthSession, workspaceId: string, agentId: string) {
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  const agent = await apiTokenRepository.findAgent(agentId);
  if (!agent || agent.workspaceId !== workspaceId) {
    log.warn({ userId: session.user.id, workspaceId, agentId }, '[api-token.agent] not found');
    throw new NotFoundError('Агент не найден');
  }
  return agent;
}

/** Выпускает токен агента (только владелец пространства агента; агент должен быть включён). */
export async function createAgentToken(
  session: AuthSession,
  input: CreateAgentTokenInput,
): Promise<CreatedApiTokenDto> {
  const { workspaceId, agentId } = input;
  const agent = await requireAgentOwner(session, workspaceId, agentId);
  if (agent.disabledAt) {
    log.warn({ agentId, workspaceId }, '[api-token.createAgent] rejected: agent disabled');
    throw new ValidationError('Агент отключён: включите его, чтобы выпустить токен');
  }
  const scopes = normalizeScopes(input.scopes);
  const created = await issueToken({
    ...input,
    userId: agentId,
    issuedById: session.user.id,
    scopes,
  });
  log.info(
    { tokenId: created.token.id, agentId, workspaceId, by: session.user.id, scopes },
    '[api-token] agent token created',
  );
  return created;
}

/** Токены агента — для владельца пространства на странице агента. */
export async function listAgentTokens(
  session: AuthSession,
  workspaceId: string,
  agentId: string,
): Promise<ApiTokenDto[]> {
  await requireAgentOwner(session, workspaceId, agentId);
  const rows = await apiTokenRepository.listForUser(agentId);
  log.debug({ agentId, workspaceId, count: rows.length }, '[api-token.listAgent]');
  const now = new Date();
  return rows.map((row) => toDto(row, now));
}

/** Отзывает токен агента (только владелец пространства агента). */
export async function revokeAgentToken(
  session: AuthSession,
  input: { workspaceId: string; agentId: string; tokenId: string },
): Promise<void> {
  const { workspaceId, agentId, tokenId } = input;
  await requireAgentOwner(session, workspaceId, agentId);
  const row = await apiTokenRepository.findOwned(agentId, tokenId);
  if (!row) {
    log.warn({ agentId, tokenId }, '[api-token.revokeAgent] not found');
    throw new NotFoundError('Токен не найден');
  }
  if (row.revokedAt) return;
  const revoked = await apiTokenRepository.revoke(tokenId, new Date());
  log.info(
    { tokenId, agentId, workspaceId, by: session.user.id, revoked },
    '[api-token] agent token revoked',
  );
}

/**
 * Отзывает все токены пользователя. Без проверки сессии: только для серверных модулей, которые
 * уже проверили права (отключение агента владельцем пространства в модуле agents).
 */
export async function revokeAllUserApiTokens(userId: string): Promise<number> {
  const revoked = await apiTokenRepository.revokeAllForUser(userId, new Date());
  log.info({ userId, revoked }, '[api-token] all user tokens revoked');
  return revoked;
}

function isBanned(user: { banned: boolean | null; banExpires: Date | null }, now: Date): boolean {
  if (!user.banned) return false;
  return !user.banExpires || user.banExpires.getTime() > now.getTime();
}

/**
 * Проверяет `Authorization: Bearer tkr_…` и строит сессию владельца токена (человека или агента).
 * Пользователь, агент и членство читаются при каждом запросе: блокировка, отключение агента и выход
 * из пространства действуют сразу. Роль всегда `user` — токен не даёт админских прав.
 */
export async function authenticateApiToken(
  authorization: string | null | undefined,
): Promise<ApiTokenContext> {
  const token = parseBearer(authorization);
  if (!token) throw reject('malformed');

  const row = await apiTokenRepository.findByHash(hashApiToken(token));
  if (!row) throw reject('unknown');

  const now = new Date();
  const state = apiTokenState(row, now);
  if (state !== 'active') throw reject(state, row.id);
  if (isBanned(row.user, now)) throw reject('banned', row.id);
  // Архивное пространство недоступно агентам: токены не отзываются и снова работают после восстановления.
  if (row.workspace.archivedAt) throw reject('workspace_archived', row.id);

  const agent = row.user.agent;
  if (row.user.isAgent && (!agent || agent.disabledAt || agent.workspaceId !== row.workspace.id)) {
    throw reject('agent_disabled', row.id);
  }

  const via: AuthVia = {
    tokenId: row.id,
    tokenName: row.name,
    scopes: normalizeScopes(row.scopes),
    agent:
      row.user.isAgent && agent
        ? {
            name: row.user.name,
            responsibleUserId: agent.responsibleUserId,
            responsibleName: agent.responsible?.name ?? null,
          }
        : null,
  };
  const session: AuthSession = {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      image: row.user.image,
      role: 'user',
      banned: false,
      isAgent: row.user.isAgent,
    },
    session: { id: `api-token:${row.id}`, expiresAt: row.expiresAt ?? new Date(8.64e15) },
    via,
  };

  try {
    await requireWorkspaceAccess(session, row.workspace.id);
  } catch (error) {
    if (error instanceof NotFoundError) throw reject('not_member', row.id);
    throw error;
  }

  if (shouldTouchApiToken(row.lastUsedAt, now)) {
    const before = new Date(now.getTime() - API_TOKEN_TOUCH_INTERVAL_MS);
    // Без ожидания: учёт использования не должен задерживать или ронять запрос.
    apiTokenRepository.touch(row.id, now, before).catch((error: unknown) => {
      log.warn({ err: error, tokenId: row.id }, '[api-token.authenticate] touch failed');
    });
  }

  log.debug(
    {
      tokenId: row.id,
      userId: row.user.id,
      workspaceId: row.workspace.id,
      agent: row.user.isAgent,
      scopes: via.scopes,
    },
    '[api-token.authenticate] ok',
  );
  const { archivedAt: _archivedAt, ...workspace } = row.workspace;
  return { session, workspace, tokenId: row.id, tokenPrefix: row.prefix, via };
}
