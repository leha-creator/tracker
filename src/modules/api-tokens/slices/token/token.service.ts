import 'server-only';

import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError, UnauthorizedError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  API_TOKEN_TOUCH_INTERVAL_MS,
  API_TOKENS_PER_USER_LIMIT,
  apiTokenState,
  expiryToDate,
  generateApiToken,
  hashApiToken,
  parseBearer,
  shouldTouchApiToken,
} from '../../models';
import type { ApiTokenDto, CreatedApiTokenDto } from './token.dto';
import { apiTokenRepository, type ApiTokenRow } from './token.repository';
import type { CreateApiTokenInput } from './token.schema';

const log = createLogger('api-tokens');

/** Одно сообщение на все причины отказа: не подсказываем, что именно не так с токеном. */
const INVALID_TOKEN_MESSAGE = 'Недействительный токен доступа';

/** Подтверждённый токен: синтетическая сессия владельца и пространство токена. */
export interface ApiTokenContext {
  session: AuthSession;
  workspace: { id: string; slug: string; name: string; taskKey: string | null };
  tokenId: string;
  tokenPrefix: string;
}

type RejectReason = 'malformed' | 'unknown' | 'revoked' | 'expired' | 'banned' | 'not_member';

function reject(reason: RejectReason, tokenId?: string): UnauthorizedError {
  log.warn({ reason, tokenId }, '[api-token.authenticate] rejected');
  return new UnauthorizedError(INVALID_TOKEN_MESSAGE);
}

function toDto(row: ApiTokenRow, now: Date): ApiTokenDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    workspace: row.workspace,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    state: apiTokenState(row, now),
  };
}

/** Выпускает токен для пространства, где пользователь — участник. Токен возвращается один раз. */
export async function createApiToken(
  session: AuthSession,
  input: CreateApiTokenInput,
): Promise<CreatedApiTokenDto> {
  const userId = session.user.id;
  const { workspaceId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  const now = new Date();
  log.debug({ userId, workspaceId, expiry: input.expiry }, '[api-token.create] start');

  const active = await apiTokenRepository.countActive(userId, now);
  if (active >= API_TOKENS_PER_USER_LIMIT) {
    log.warn({ userId, active }, '[api-token.create] limit reached');
    throw new ValidationError(
      `Не больше ${API_TOKENS_PER_USER_LIMIT} действующих токенов. Отзовите ненужные.`,
    );
  }

  const { token, prefix, hash } = generateApiToken();
  const row = await apiTokenRepository.create({
    userId,
    workspaceId,
    name: input.name,
    prefix,
    tokenHash: hash,
    expiresAt: expiryToDate(input.expiry, now),
  });
  log.info({ tokenId: row.id, userId, workspaceId, prefix }, '[api-token] created');
  return { token: toDto(row, now), secret: token };
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

function isBanned(user: { banned: boolean | null; banExpires: Date | null }, now: Date): boolean {
  if (!user.banned) return false;
  return !user.banExpires || user.banExpires.getTime() > now.getTime();
}

/**
 * Проверяет `Authorization: Bearer tkr_…` и строит сессию владельца токена.
 * Пользователь и членство читаются при каждом запросе: блокировка и выход из пространства
 * действуют сразу. Роль всегда `user` — токен не даёт админских прав.
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

  const session: AuthSession = {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      image: row.user.image,
      role: 'user',
      banned: false,
    },
    session: { id: `api-token:${row.id}`, expiresAt: row.expiresAt ?? new Date(8.64e15) },
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
    { tokenId: row.id, userId: row.user.id, workspaceId: row.workspace.id },
    '[api-token.authenticate] ok',
  );
  return { session, workspace: row.workspace, tokenId: row.id, tokenPrefix: row.prefix };
}
