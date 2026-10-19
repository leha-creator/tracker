import 'server-only';

import { headers } from 'next/headers';

import { getAccountMetrics } from '@/modules/auth';
import { getTotalDocumentStorageUsage } from '@/modules/documents';
import { getTotalAttachmentStorageUsage } from '@/modules/tasks';
import { countAllWorkspaces } from '@/modules/workspaces';
import { requireAdmin } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import { checkHealth } from '@/shared/health';
import { createLogger, maskEmail } from '@/shared/logger';
import { escapeHtml, sendMail } from '@/shared/mail';
import { enforceRateLimit, getClientIp } from '@/shared/rate-limit';

import { dailySeriesStart, fillDailySeries, SIGNUPS_PERIOD_DAYS } from '../../models';
import type { ResourceOverviewDto } from './overview.dto';

const log = createLogger('admin.overview');

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getResourceOverview(): Promise<ResourceOverviewDto> {
  const session = await requireAdmin();
  const startedAt = Date.now();
  const now = new Date(startedAt);
  // Метрики учётных записей — из модуля auth: после переезда входа в IdP меняется только он.
  const [accounts, workspaces, documents, attachments, health] = await Promise.all([
    getAccountMetrics({
      now,
      signupsSince: dailySeriesStart(now, SIGNUPS_PERIOD_DAYS),
      failedSignInsSince: new Date(startedAt - DAY_MS),
    }),
    countAllWorkspaces(),
    getTotalDocumentStorageUsage(),
    getTotalAttachmentStorageUsage(),
    checkHealth(),
  ]);
  const signups = fillDailySeries(accounts.signupsByDay, SIGNUPS_PERIOD_DAYS, now);
  log.debug({ durationMs: Date.now() - startedAt }, '[admin.overview]');
  return {
    users: accounts.users,
    workspaces,
    sessions: accounts.sessions,
    signups,
    signupsTotal: signups.reduce((sum, point) => sum + point.count, 0),
    failedSignIns24h: accounts.failedSignIns,
    storage: { documents, attachments },
    health: { db: health.checks.db.ok, storage: health.checks.storage.ok },
    adminEmail: session.user.email,
  };
}

/** Тестовое письмо на свой email: проверка настроек SMTP. */
export async function sendTestMail(): Promise<{ to: string }> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  await enforceRateLimit('admin-mail', { ip: getClientIp(await headers()), userId: actorId });
  const to = session.user.email;
  try {
    await sendMail({
      to,
      subject: 'Tasker: тестовое письмо',
      text: `Это тестовое письмо из раздела администрирования Tasker. Отправил: ${session.user.name}.`,
      html: `<p>Это тестовое письмо из раздела администрирования Tasker.</p><p>Отправил: ${escapeHtml(session.user.name)}.</p>`,
    });
  } catch (error) {
    log.warn({ err: error, actorId }, '[admin.testMail] failed');
    throw new ValidationError(
      'Не удалось отправить письмо. Проверьте SMTP-настройки сервера и журнал приложения.',
      { cause: error },
    );
  }
  log.info({ actorId, to: maskEmail(to) }, '[admin.testMail] sent');
  await recordAuditEvent({
    kind: 'admin.test_mail_sent',
    actor: auditActorFromSession(session),
    data: {},
  });
  return { to };
}
