import 'server-only';

import { randomUUID } from 'node:crypto';

import { formatTaskKey } from '@/modules/tasks';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { findIdpSubject } from '@/shared/idp';
import { createLogger } from '@/shared/logger';
import { enforceRateLimit } from '@/shared/rate-limit';

import { requireMeetConfig, taskUrl } from '../../meet-config';
import { CONTEXT_TTL_SECONDS, signTaskContext } from '../../models';
import { meetingRepository } from '../meeting/meeting.repository';

const log = createLogger('integrations:meet');

/**
 * Адрес «Начать созвон»: `<MEET_URL>/new?ctx=<подписанный контекст задачи>` (docs/meet.md).
 * Встречу создаёт meet, когда пользователь откроет адрес; связь с задачей придёт вебхуком.
 */
export async function startTaskMeeting(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; ip: string | null },
): Promise<{ url: string }> {
  const config = requireMeetConfig();
  const { workspaceId, taskId } = input;
  const userId = session.user.id;

  if (session.user.isAgent || session.via) {
    log.warn({ workspaceId, taskId, userId }, '[meet.start] rejected: token or agent session');
    throw new ForbiddenError('Созвон начинает человек из браузера');
  }
  await requireWorkspaceAccess(session, workspaceId);

  const task = await meetingRepository.findTask(workspaceId, taskId);
  if (!task) throw new NotFoundError('Задача не найдена');
  if (task.archivedAt) {
    log.warn({ workspaceId, taskId, userId }, '[meet.start] rejected: archived task');
    throw new ValidationError('Задача в архиве');
  }

  const sub = await findIdpSubject(userId);
  if (!sub) {
    log.warn({ workspaceId, taskId, userId }, '[meet.start] rejected: user not linked to IdP');
    throw new ValidationError('Войдите в Tasker через plwedding ID, чтобы начать созвон');
  }

  await enforceRateLimit('meet.start', { ip: input.ip, userId });

  const now = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  const token = signTaskContext(
    {
      v: 1,
      iss: 'tasker',
      aud: 'meet',
      jti,
      sub,
      workspaceId,
      workspaceName: task.workspace.name,
      taskId,
      taskKey: formatTaskKey(task.number, task.workspace.taskKey),
      taskTitle: task.title,
      taskUrl: taskUrl(task.workspace.slug, task.number),
      iat: now,
      exp: now + CONTEXT_TTL_SECONDS,
    },
    config.contextSecret,
  );

  const url = new URL('/new', config.url);
  url.searchParams.set('ctx', token);
  log.info({ workspaceId, taskId, userId, jti }, '[meet.start] context issued');
  return { url: url.toString() };
}
