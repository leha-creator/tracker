import 'server-only';

import { randomUUID } from 'node:crypto';

import { revokeAllUserApiTokens } from '@/modules/api-tokens';
import { requireWorkspaceAccess } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import { agentEmail, type AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { agentAvatarUrl, assertAgentLimit } from '../../models';
import type { AgentDto } from './agent.dto';
import { agentRepository, type AgentRow } from './agent.repository';
import type { AgentRefInput, CreateAgentInput, UpdateAgentInput } from './agent.schema';

const log = createLogger('agents');

function toDto(row: AgentRow): AgentDto {
  const membership = row.user.workspaceMemberships.find(
    (member) => member.workspaceId === row.workspaceId,
  );
  return {
    id: row.userId,
    name: row.user.name,
    description: row.description,
    image: row.user.image,
    responsible: row.responsible
      ? { userId: row.responsible.id, name: row.responsible.name }
      : null,
    canManageProjects: membership?.canManageProjects ?? false,
    canManageDocuments: membership?.canManageDocuments ?? false,
    createdAt: row.createdAt,
    disabledAt: row.disabledAt,
  };
}

async function assertResponsible(workspaceId: string, userId: string): Promise<void> {
  if (await agentRepository.isHumanMember(workspaceId, userId)) return;
  log.warn({ workspaceId, responsibleUserId: userId }, '[agent] responsible is not a member');
  throw new ValidationError('Ответственный должен быть участником пространства', {
    fieldErrors: { responsibleUserId: ['Выберите участника пространства'] },
  });
}

async function loadAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
  const row = await agentRepository.findInWorkspace(workspaceId, agentId);
  if (!row) {
    log.warn({ workspaceId, agentId }, '[agent] not found');
    throw new NotFoundError('Агент не найден');
  }
  return row;
}

async function requireOwner(session: AuthSession, workspaceId: string, scope: string) {
  try {
    return await requireWorkspaceAccess(session, workspaceId, 'owner');
  } catch (error) {
    log.warn({ userId: session.user.id, workspaceId }, `[agent.${scope}] rejected: not an owner`);
    throw error;
  }
}

/** Создаёт агента: служебный пользователь, членство с правами и ответственный (только владелец). */
export async function createAgent(
  session: AuthSession,
  input: CreateAgentInput,
): Promise<AgentDto> {
  const { workspaceId } = input;
  await requireOwner(session, workspaceId, 'create');
  log.debug({ workspaceId, by: session.user.id }, '[agent.create] start');

  const activeCount = await agentRepository.countActive(workspaceId);
  try {
    assertAgentLimit(activeCount);
  } catch (error) {
    log.warn({ workspaceId, activeCount }, '[agent.create] rejected: limit');
    throw error;
  }
  await assertResponsible(workspaceId, input.responsibleUserId);

  const agentId = randomUUID();
  await agentRepository.create({
    agentId,
    memberId: randomUUID(),
    workspaceId,
    name: input.name,
    email: agentEmail(agentId),
    image: agentAvatarUrl(agentId),
    description: input.description,
    responsibleUserId: input.responsibleUserId,
    createdById: session.user.id,
    flags: {
      canManageProjects: input.canManageProjects,
      canManageDocuments: input.canManageDocuments,
    },
  });
  log.info({ agentId, workspaceId, by: session.user.id }, '[agent] created');
  await recordAuditEvent({
    kind: 'agent.created',
    actor: auditActorFromSession(session),
    targetUserId: agentId,
    workspaceId,
    data: { agentName: input.name },
  });
  return toDto(await loadAgent(workspaceId, agentId));
}

/** Меняет имя, описание, ответственного и права агента (только владелец). */
export async function updateAgent(
  session: AuthSession,
  input: UpdateAgentInput,
): Promise<AgentDto> {
  const { workspaceId, agentId } = input;
  await requireOwner(session, workspaceId, 'update');
  await loadAgent(workspaceId, agentId);
  await assertResponsible(workspaceId, input.responsibleUserId);

  await agentRepository.update({
    agentId,
    workspaceId,
    name: input.name,
    description: input.description,
    responsibleUserId: input.responsibleUserId,
    flags: {
      canManageProjects: input.canManageProjects,
      canManageDocuments: input.canManageDocuments,
    },
  });
  log.info({ agentId, workspaceId, by: session.user.id }, '[agent] updated');
  return toDto(await loadAgent(workspaceId, agentId));
}

/**
 * Отключает агента: снимает членство (пропадает из выбора ответственного и упоминаний) и отзывает
 * все его токены. Строка пользователя остаётся — авторство в истории сохраняется.
 */
export async function disableAgent(session: AuthSession, input: AgentRefInput): Promise<void> {
  const { workspaceId, agentId } = input;
  await requireOwner(session, workspaceId, 'disable');
  const agent = await loadAgent(workspaceId, agentId);
  if (agent.disabledAt) {
    log.debug({ agentId, workspaceId }, '[agent.disable] already disabled');
    return;
  }

  await agentRepository.disable(workspaceId, agentId, new Date());
  const revokedTokens = await revokeAllUserApiTokens(agentId);
  log.info({ agentId, workspaceId, by: session.user.id, revokedTokens }, '[agent] disabled');
  await recordAuditEvent({
    kind: 'agent.disabled',
    actor: auditActorFromSession(session),
    targetUserId: agentId,
    workspaceId,
    data: { agentName: agent.user.name },
  });
}

/** Включает агента обратно: членство без дополнительных прав, токены нужно выпустить заново. */
export async function enableAgent(session: AuthSession, input: AgentRefInput): Promise<void> {
  const { workspaceId, agentId } = input;
  await requireOwner(session, workspaceId, 'enable');
  const agent = await loadAgent(workspaceId, agentId);
  if (!agent.disabledAt) {
    log.debug({ agentId, workspaceId }, '[agent.enable] already enabled');
    return;
  }

  const activeCount = await agentRepository.countActive(workspaceId);
  try {
    assertAgentLimit(activeCount);
  } catch (error) {
    log.warn({ workspaceId, activeCount }, '[agent.enable] rejected: limit');
    throw error;
  }

  await agentRepository.enable(workspaceId, agentId, randomUUID());
  log.info({ agentId, workspaceId, by: session.user.id }, '[agent] enabled');
  await recordAuditEvent({
    kind: 'agent.enabled',
    actor: auditActorFromSession(session),
    targetUserId: agentId,
    workspaceId,
    data: { agentName: agent.user.name },
  });
}

/** Агенты пространства — для любого участника (имя, ответственный, отключён ли). */
export async function listAgents(session: AuthSession, workspaceId: string): Promise<AgentDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  const rows = await agentRepository.listByWorkspace(workspaceId);
  log.debug({ userId: session.user.id, workspaceId, count: rows.length }, '[agent.list]');
  return rows.map(toDto);
}

/** Агент пространства для его страницы настроек (только владелец). */
export async function getAgent(
  session: AuthSession,
  workspaceId: string,
  agentId: string,
): Promise<AgentDto> {
  await requireOwner(session, workspaceId, 'get');
  const row = await loadAgent(workspaceId, agentId);
  log.debug({ userId: session.user.id, workspaceId, agentId }, '[agent.get]');
  return toDto(row);
}
