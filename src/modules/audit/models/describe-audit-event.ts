import {
  AUDIT_EVENTS,
  isAuditEventKind,
  type AuditEventKind,
  type AuditEventStoredData,
} from '@/shared/audit/client';

/**
 * Текст и ссылка события для ленты. Формулировки безличные («Создание задачи…»): автор показан
 * рядом, а глагол прошедшего времени потребовал бы угадывать род.
 */
export interface AuditEventDescription {
  text: string;
  /** Подробности (причина блокировки, изменённые настройки) — только в админской перспективе. */
  details: string | null;
  href: string | null;
}

/** Кто смотрит: от этого зависят ссылки и подробности. */
export type AuditPerspective = 'member' | 'self' | 'admin';

export interface AuditDescribeContext {
  /** Slug пространства события; null — пространства нет (удалено) или событие вне него. */
  workspaceSlug: string | null;
  targetUserId: string | null;
  perspective: AuditPerspective;
}

const ROLE_LABELS = { owner: 'владелец', member: 'участник' } as const;
const PERMISSION_LABELS = {
  manageProjects: 'Управление проектами',
  manageDocuments: 'Управление документами',
} as const;
const BAN_DURATION_TEXT = {
  forever: 'бессрочно',
  '1d': 'на 1 день',
  '7d': 'на 7 дней',
  '30d': 'на 30 дней',
} as const;
const SIGN_IN_TEXT = {
  password: 'Вход по паролю',
  github: 'Вход через GitHub',
  oidc: 'Вход через plwedding ID',
  two_factor: 'Вход с кодом двухфакторной аутентификации',
  other: 'Вход',
} as const;
const SIGN_UP_TEXT = {
  email: 'Регистрация',
  github: 'Регистрация через GitHub',
  oidc: 'Регистрация через plwedding ID',
} as const;
/** Причины неудачного входа (коды Better Auth). */
const SIGN_IN_FAILURE_REASONS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'неверный пароль',
  EMAIL_NOT_VERIFIED: 'email не подтверждён',
  BANNED_USER: 'пользователь заблокирован',
  INVALID_CODE: 'неверный код',
  INVALID_BACKUP_CODE: 'неверный резервный код',
  RATE_LIMITED: 'слишком много попыток',
};

function quoted(value: string): string {
  return `«${value}»`;
}

type Describer<K extends AuditEventKind> = (
  data: AuditEventStoredData<K>,
  context: AuditDescribeContext,
) => { text: string; details?: string | null; href?: string | null };

function inWorkspace(context: AuditDescribeContext, path = ''): string | null {
  return context.workspaceSlug ? `/w/${context.workspaceSlug}${path}` : null;
}

function adminUserHref(context: AuditDescribeContext): string | null {
  return context.perspective === 'admin' && context.targetUserId
    ? `/admin/users/${context.targetUserId}`
    : null;
}

function taskText(prefix: string, data: { taskKey: string; title: string }): string {
  return `${prefix} ${data.taskKey} ${quoted(data.title)}`;
}

const DESCRIBERS: { [K in AuditEventKind]: Describer<K> } = {
  'auth.signed_up': (data) => ({
    text: SIGN_UP_TEXT[data.method],
  }),
  'auth.sign_in': (data) => ({ text: SIGN_IN_TEXT[data.method] }),
  'auth.sign_in_failed': (data) => {
    const reason = SIGN_IN_FAILURE_REASONS[data.reason];
    const base =
      data.method === 'two_factor'
        ? 'Неудачный вход: код двухфакторной аутентификации'
        : 'Неудачный вход по паролю';
    return { text: reason ? `${base} — ${reason}` : base };
  },
  'auth.sign_out': () => ({ text: 'Выход' }),
  'auth.password_reset_requested': () => ({ text: 'Запрос сброса пароля' }),
  'auth.password_reset': () => ({ text: 'Сброс пароля по ссылке из письма' }),
  'auth.password_changed': () => ({ text: 'Смена пароля' }),
  'auth.email_verified': () => ({ text: 'Подтверждение email' }),
  'auth.two_factor_enabled': () => ({ text: 'Включение двухфакторной аутентификации' }),
  'auth.two_factor_disabled': () => ({ text: 'Отключение двухфакторной аутентификации' }),
  'auth.backup_codes_regenerated': () => ({ text: 'Новые резервные коды' }),
  'auth.sessions_revoked': (data) => ({
    text:
      data.scope === 'one'
        ? 'Завершение сессии на другом устройстве'
        : 'Завершение всех других сессий',
  }),
  'auth.github_linked': () => ({ text: 'Привязка GitHub' }),
  'auth.github_unlinked': () => ({ text: 'Отвязка GitHub' }),
  'token.issued': (data) => ({
    text: `Выпуск токена ${quoted(data.tokenName)}${data.agent ? ' для агента' : ''} в пространстве ${quoted(data.workspaceName)}`,
  }),
  'token.revoked': (data) => ({
    text: `Отзыв токена ${quoted(data.tokenName)}${data.agent ? ' агента' : ''} в пространстве ${quoted(data.workspaceName)}`,
  }),

  'workspace.created': (data, context) => ({
    text: `Создание пространства ${quoted(data.workspaceName)}`,
    href: inWorkspace(context),
  }),
  'workspace.renamed': (data, context) => ({
    text: `Переименование пространства ${quoted(data.previousName)} в ${quoted(data.workspaceName)}`,
    href: inWorkspace(context),
  }),
  'workspace.archived': (data) => ({
    text: `Отправка пространства ${quoted(data.workspaceName)} в архив`,
  }),
  'workspace.restored': (data, context) => ({
    text: `Восстановление пространства ${quoted(data.workspaceName)} из архива`,
    href: inWorkspace(context),
  }),
  'workspace.deleted': (data) => ({ text: `Удаление пространства ${quoted(data.workspaceName)}` }),
  'workspace.member_joined': (data, context) => ({
    text: `Вступление в пространство ${quoted(data.workspaceName)} (${ROLE_LABELS[data.role]})`,
    href: inWorkspace(context),
  }),
  'workspace.member_removed': (data) => ({
    text: data.left ? 'Выход из пространства' : `Исключение участника ${data.memberName}`,
  }),
  'workspace.member_role_changed': (data) => ({
    text: `Смена роли участника ${data.memberName}: ${ROLE_LABELS[data.role]}`,
  }),
  'workspace.member_permissions_changed': (data) => ({
    text: `${data.value ? 'Выдача' : 'Отзыв'} права ${quoted(PERMISSION_LABELS[data.permission])} участнику ${data.memberName}`,
  }),
  'workspace.invitation_sent': (data) => ({
    text: `Приглашение ${data.email} (${ROLE_LABELS[data.role]})`,
  }),
  'workspace.invitation_canceled': (data) => ({ text: `Отмена приглашения ${data.email}` }),
  'agent.created': (data) => ({ text: `Создание агента ${data.agentName}` }),
  'agent.disabled': (data) => ({ text: `Отключение агента ${data.agentName}` }),
  'agent.enabled': (data) => ({ text: `Включение агента ${data.agentName}` }),
  'project.created': (data, context) => ({
    text: `Создание проекта ${quoted(data.projectName)}`,
    href: inWorkspace(context, `/projects/${data.projectId}/board`),
  }),
  'project.archived': (data, context) => ({
    text: `Отправка проекта ${quoted(data.projectName)} в архив`,
    href: inWorkspace(context, `/projects/${data.projectId}/settings`),
  }),
  'project.restored': (data, context) => ({
    text: `Восстановление проекта ${quoted(data.projectName)} из архива`,
    href: inWorkspace(context, `/projects/${data.projectId}/board`),
  }),
  'project.deleted': (data) => ({ text: `Удаление проекта ${quoted(data.projectName)}` }),

  'task.created': (data, context) => ({
    text: taskText('Создание задачи', data),
    href: inWorkspace(context, `/tasks/${data.taskNumber}`),
  }),
  'task.archived': (data, context) => ({
    text: `${taskText('Отправка задачи', data)} в архив`,
    href: inWorkspace(context, `/tasks/${data.taskNumber}`),
  }),
  'task.restored': (data, context) => ({
    text: `${taskText('Восстановление задачи', data)} из архива`,
    href: inWorkspace(context, `/tasks/${data.taskNumber}`),
  }),
  'task.deleted': (data) => ({ text: `${taskText('Удаление задачи', data)} навсегда` }),
  'document.created': (data, context) => ({
    text: `${data.kind === 'note' ? 'Создание заметки' : 'Загрузка файла'} ${quoted(data.title)}`,
    href: inWorkspace(context, `/docs/${data.documentId}`),
  }),
  'document.deleted': (data) => ({
    text: `${data.kind === 'note' ? 'Удаление заметки' : 'Удаление файла'} ${quoted(data.title)}`,
  }),
  'meeting.started': (data, context) => ({
    text: `${taskText('Созвон в meet по задаче', data)} (${data.meetingCode})`,
    href: inWorkspace(context, `/tasks/${data.taskNumber}`),
  }),
  'meeting.summary_added': (data, context) => ({
    text: `${taskText('Конспект встречи по задаче', data)}: ${quoted(data.documentTitle)}`,
    href: inWorkspace(context, `/docs/${data.documentId}`),
  }),

  'admin.user_banned': (data, context) => ({
    text: `Блокировка пользователя ${data.userName} ${BAN_DURATION_TEXT[data.duration]}`,
    details: data.reason ? `Причина: ${data.reason}` : null,
    href: adminUserHref(context),
  }),
  'admin.user_unbanned': (data, context) => ({
    text: `Разблокировка пользователя ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.user_role_changed': (data, context) => ({
    text:
      data.role === 'admin'
        ? `Назначение администратором: ${data.userName}`
        : `Снятие роли администратора: ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.user_sessions_revoked': (data, context) => ({
    text: `Завершение всех сессий пользователя ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.user_session_revoked': (data, context) => ({
    text: `Завершение сессии пользователя ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.user_two_factor_reset': (data, context) => ({
    text: `Сброс двухфакторной аутентификации пользователя ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.user_deleted': (data) => ({
    text: `Удаление пользователя ${data.userName} (${data.email})`,
  }),
  'admin.user_email_verified': (data, context) => ({
    text: `Подтверждение email пользователя ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.password_reset_sent': (data, context) => ({
    text: `Письмо для сброса пароля пользователю ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.verification_sent': (data, context) => ({
    text: `Повторное письмо подтверждения пользователю ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.user_token_revoked': (data, context) => ({
    text: `Отзыв токена ${quoted(data.tokenName)} пользователя ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.impersonation_started': (data, context) => ({
    text: `Вход от имени пользователя ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.impersonation_stopped': (data, context) => ({
    text: `Завершение входа от имени пользователя ${data.userName}`,
    href: adminUserHref(context),
  }),
  'admin.workspace_archived': (data) => ({
    text: `Отправка пространства ${quoted(data.workspaceName)} в архив`,
  }),
  'admin.workspace_restored': (data) => ({
    text: `Восстановление пространства ${quoted(data.workspaceName)} из архива`,
  }),
  'admin.workspace_deleted': (data) => ({
    text: `Удаление пространства ${quoted(data.workspaceName)}`,
  }),
  'admin.workspace_owner_changed': (data) => ({
    text: `Назначение владельца пространства ${quoted(data.workspaceName)}: ${data.ownerName}`,
    details: data.demotedPrevious ? 'Прежние владельцы стали участниками' : null,
  }),
  'admin.workspace_quota_changed': (data) => ({
    text: `Квота хранилища пространства ${quoted(data.workspaceName)}: ${
      data.quotaMb === null ? 'по умолчанию' : `${data.quotaMb} МБ`
    }`,
  }),
  'admin.settings_changed': (data) => ({
    text: 'Изменение настроек ресурса',
    details: Object.entries(data.changes)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; '),
  }),
  'admin.test_mail_sent': () => ({ text: 'Тестовое письмо' }),
};

/** Текст и ссылка события. Неизвестный тип или повреждённый снимок — общий текст без ссылки. */
export function describeAuditEvent(
  kind: string,
  data: unknown,
  context: AuditDescribeContext,
): AuditEventDescription {
  if (!isAuditEventKind(kind)) return { text: 'Неизвестное событие', details: null, href: null };
  const parsed = AUDIT_EVENTS[kind].data.safeParse(data);
  if (!parsed.success) return { text: 'Событие без подробностей', details: null, href: null };
  const describe = DESCRIBERS[kind] as Describer<typeof kind>;
  const result = describe(parsed.data, context);
  return {
    text: result.text,
    details: context.perspective === 'admin' ? (result.details ?? null) : null,
    href: result.href ?? null,
  };
}
