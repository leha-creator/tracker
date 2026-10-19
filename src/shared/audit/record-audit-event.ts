import 'server-only';

import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { createLogger } from '@/shared/logger';
import { getClientIp } from '@/shared/rate-limit';

import {
  AUDIT_EVENTS,
  AUDIT_TEXT_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  type AuditEventData,
  type AuditEventKind,
} from './audit-catalog';

const log = createLogger('audit');

/** Автор события. */
export interface AuditActor {
  actorId: string;
  /** Снимок имени: событие удалённого пользователя остаётся читаемым. */
  actorName?: string | null;
  /** Администратор, действовавший от имени actorId. */
  impersonatorId?: string | null;
  /** Токен MCP, через который действовали. */
  viaTokenId?: string | null;
}

/** Откуда пришёл запрос — только для событий безопасности. */
export interface AuditRequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface RecordAuditEventInput<K extends AuditEventKind> {
  kind: K;
  /** null — система или неизвестный автор. */
  actor: AuditActor | null;
  /** Субъект: над кем действие (блокировка, чужой неудачный вход). */
  targetUserId?: string | null;
  workspaceId?: string | null;
  data: AuditEventData<K>;
  request?: AuditRequestContext | null;
}

/** Автор из сессии: человек, агент (токен) или администратор от имени пользователя. */
export function auditActorFromSession(session: AuthSession): AuditActor {
  return {
    actorId: session.user.id,
    actorName: session.user.name,
    // session может отсутствовать у синтетических сессий в тестах и старых DTO.
    impersonatorId: session.session?.impersonatedBy ?? null,
    viaTokenId: session.via?.tokenId ?? null,
  };
}

export function auditRequestContext(headers: Headers): AuditRequestContext {
  const userAgent = headers.get('user-agent')?.trim();
  return {
    ip: getClientIp(headers),
    userAgent: userAgent ? userAgent.slice(0, AUDIT_USER_AGENT_MAX_LENGTH) : null,
  };
}

/**
 * Пишет событие журнала. Вызывать после успешного изменения. Никогда не бросает: сбой журнала
 * не должен ломать действие пользователя (как notify и publishRealtimeEvent).
 */
export async function recordAuditEvent<K extends AuditEventKind>(
  input: RecordAuditEventInput<K>,
): Promise<void> {
  const { kind, actor } = input;
  const definition = AUDIT_EVENTS[kind];
  const parsed = definition.data.safeParse(input.data);
  if (!parsed.success) {
    // Неверный снимок — ошибка в коде вызова; само содержимое не логируем.
    log.error(
      { kind, issues: parsed.error.issues.map((issue) => issue.path.join('.')) },
      '[audit.record] invalid data',
    );
    return;
  }

  // IP и браузер — только у событий безопасности: участникам пространства они не нужны.
  const request = definition.category === 'security' ? (input.request ?? null) : null;
  try {
    await prisma.auditEvent.create({
      data: {
        kind,
        category: definition.category,
        actorId: actor?.actorId ?? null,
        actorName: actor?.actorName?.slice(0, AUDIT_TEXT_MAX_LENGTH) ?? null,
        impersonatorId: actor?.impersonatorId ?? null,
        viaTokenId: actor?.viaTokenId ?? null,
        targetUserId: input.targetUserId ?? null,
        workspaceId: input.workspaceId ?? null,
        data: parsed.data,
        ip: request?.ip ?? null,
        userAgent: request?.userAgent ?? null,
      },
    });
    log.debug(
      {
        kind,
        actorId: actor?.actorId ?? null,
        workspaceId: input.workspaceId ?? null,
        impersonated: Boolean(actor?.impersonatorId),
      },
      '[audit.record]',
    );
  } catch (error) {
    log.error({ err: error, kind }, '[audit.record] failed');
  }
}
