import { z } from 'zod';

/**
 * Каталог событий журнала действий (AuditEvent). Тип события определяет категорию, а категория —
 * кто видит событие: пользователь выбирать видимость не может.
 */

export const AUDIT_CATEGORIES = ['security', 'workspace', 'content', 'admin'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/**
 * Кто видит события категории:
 * - `self` — сам пользователь (автор или субъект) и администратор;
 * - `workspace` — участники пространства (в профиле участника) и администратор;
 * - `admin` — только администраторы.
 */
export type AuditVisibility = 'self' | 'workspace' | 'admin';

export const AUDIT_CATEGORY_VISIBILITY: Record<AuditCategory, AuditVisibility> = {
  security: 'self',
  workspace: 'workspace',
  content: 'workspace',
  admin: 'admin',
};

/** Предел строки в снимке: заголовки и названия, не свободный текст. */
export const AUDIT_TEXT_MAX_LENGTH = 200;
/** Причина блокировки — единственный свободный текст (виден только администраторам). */
export const AUDIT_REASON_MAX_LENGTH = 500;
export const AUDIT_USER_AGENT_MAX_LENGTH = 300;

/** Строка снимка: обрезается, а не отклоняется — журнал не должен терять событие из-за длины. */
const text = (max = AUDIT_TEXT_MAX_LENGTH) =>
  z
    .string()
    .trim()
    .transform((value) => value.slice(0, max));

const nothing = z.object({});
const workspaceSnapshot = z.object({ workspaceName: text() });
const memberSnapshot = z.object({ memberName: text() });
const userSnapshot = z.object({ userName: text() });
const taskSnapshot = z.object({ taskKey: text(40), taskNumber: z.number().int(), title: text() });
const documentSnapshot = z.object({
  documentId: z.string().max(64),
  title: text(),
  kind: z.enum(['note', 'file']),
});
const projectSnapshot = z.object({ projectId: z.string().max(64), projectName: text() });

export const SIGN_IN_METHODS = ['password', 'github', 'two_factor', 'other'] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

const WORKSPACE_ROLE = z.enum(['owner', 'member']);

function event<const C extends AuditCategory, S extends z.ZodType>(category: C, data: S) {
  return { category, data };
}

export const AUDIT_EVENTS = {
  // ── Безопасность ──
  'auth.signed_up': event('security', z.object({ method: z.enum(['email', 'github']) })),
  'auth.sign_in': event('security', z.object({ method: z.enum(SIGN_IN_METHODS) })),
  'auth.sign_in_failed': event(
    'security',
    z.object({ method: z.enum(['password', 'two_factor']), reason: text(64) }),
  ),
  'auth.sign_out': event('security', nothing),
  'auth.password_reset_requested': event('security', nothing),
  'auth.password_reset': event('security', nothing),
  'auth.password_changed': event('security', nothing),
  'auth.email_verified': event('security', nothing),
  'auth.two_factor_enabled': event('security', nothing),
  'auth.two_factor_disabled': event('security', nothing),
  'auth.backup_codes_regenerated': event('security', nothing),
  'auth.sessions_revoked': event('security', z.object({ scope: z.enum(['one', 'others']) })),
  'auth.github_linked': event('security', z.object({ login: text(64).nullable() })),
  'auth.github_unlinked': event('security', nothing),
  'token.issued': event(
    'security',
    z.object({ tokenName: text(), agent: z.boolean(), workspaceName: text() }),
  ),
  'token.revoked': event(
    'security',
    z.object({ tokenName: text(), agent: z.boolean(), workspaceName: text() }),
  ),

  // ── Пространство ──
  'workspace.created': event('workspace', workspaceSnapshot),
  'workspace.renamed': event('workspace', workspaceSnapshot.extend({ previousName: text() })),
  'workspace.archived': event('workspace', workspaceSnapshot),
  'workspace.restored': event('workspace', workspaceSnapshot),
  'workspace.deleted': event('workspace', workspaceSnapshot),
  'workspace.member_joined': event('workspace', workspaceSnapshot.extend({ role: WORKSPACE_ROLE })),
  'workspace.member_removed': event('workspace', memberSnapshot.extend({ left: z.boolean() })),
  'workspace.member_role_changed': event(
    'workspace',
    memberSnapshot.extend({ role: WORKSPACE_ROLE }),
  ),
  'workspace.member_permissions_changed': event(
    'workspace',
    memberSnapshot.extend({
      permission: z.enum(['manageProjects', 'manageDocuments']),
      value: z.boolean(),
    }),
  ),
  'workspace.invitation_sent': event(
    'workspace',
    z.object({ email: text(), role: WORKSPACE_ROLE }),
  ),
  'workspace.invitation_canceled': event('workspace', z.object({ email: text() })),
  'agent.created': event('workspace', z.object({ agentName: text() })),
  'agent.disabled': event('workspace', z.object({ agentName: text() })),
  'agent.enabled': event('workspace', z.object({ agentName: text() })),
  'project.created': event('workspace', projectSnapshot),
  'project.archived': event('workspace', projectSnapshot),
  'project.restored': event('workspace', projectSnapshot),
  'project.deleted': event('workspace', projectSnapshot),

  // ── Содержимое ──
  'task.created': event('content', taskSnapshot),
  'task.archived': event('content', taskSnapshot),
  'task.restored': event('content', taskSnapshot),
  'task.deleted': event('content', taskSnapshot),
  'document.created': event('content', documentSnapshot),
  'document.deleted': event('content', documentSnapshot),

  // ── Администрирование ──
  'admin.user_banned': event(
    'admin',
    userSnapshot.extend({
      duration: z.enum(['forever', '1d', '7d', '30d']),
      reason: text(AUDIT_REASON_MAX_LENGTH).nullable(),
    }),
  ),
  'admin.user_unbanned': event('admin', userSnapshot),
  'admin.user_role_changed': event(
    'admin',
    userSnapshot.extend({ role: z.enum(['user', 'admin']) }),
  ),
  'admin.user_sessions_revoked': event('admin', userSnapshot),
  'admin.user_session_revoked': event('admin', userSnapshot),
  'admin.user_two_factor_reset': event('admin', userSnapshot),
  'admin.user_deleted': event('admin', userSnapshot.extend({ email: text() })),
  'admin.user_email_verified': event('admin', userSnapshot),
  'admin.password_reset_sent': event('admin', userSnapshot),
  'admin.verification_sent': event('admin', userSnapshot),
  'admin.user_token_revoked': event('admin', userSnapshot.extend({ tokenName: text() })),
  'admin.impersonation_started': event('admin', userSnapshot),
  'admin.impersonation_stopped': event('admin', userSnapshot),
  'admin.workspace_archived': event('admin', workspaceSnapshot),
  'admin.workspace_restored': event('admin', workspaceSnapshot),
  'admin.workspace_deleted': event('admin', workspaceSnapshot),
  'admin.workspace_owner_changed': event(
    'admin',
    workspaceSnapshot.extend({ ownerName: text(), demotedPrevious: z.boolean() }),
  ),
  'admin.workspace_quota_changed': event(
    'admin',
    workspaceSnapshot.extend({ quotaMb: z.number().int().nullable() }),
  ),
  'admin.settings_changed': event(
    'admin',
    z.object({ changes: z.record(z.string().max(64), text()) }),
  ),
  'admin.test_mail_sent': event('admin', nothing),
} as const;

export type AuditEventKind = keyof typeof AUDIT_EVENTS;
export const AUDIT_EVENT_KINDS = Object.keys(AUDIT_EVENTS) as AuditEventKind[];

/** Данные события на входе записи (до обрезки строк). */
export type AuditEventData<K extends AuditEventKind> = z.input<(typeof AUDIT_EVENTS)[K]['data']>;
/** Данные события после разбора (так они лежат в БД). */
export type AuditEventStoredData<K extends AuditEventKind> = z.output<
  (typeof AUDIT_EVENTS)[K]['data']
>;

export function isAuditEventKind(value: string): value is AuditEventKind {
  return Object.hasOwn(AUDIT_EVENTS, value);
}

export function auditCategoryOf(kind: AuditEventKind): AuditCategory {
  return AUDIT_EVENTS[kind].category;
}

export function auditVisibilityOf(kind: AuditEventKind): AuditVisibility {
  return AUDIT_CATEGORY_VISIBILITY[auditCategoryOf(kind)];
}

/** Типы событий категории — для фильтров журнала. */
export function auditKindsOfCategory(category: AuditCategory): AuditEventKind[] {
  return AUDIT_EVENT_KINDS.filter((kind) => auditCategoryOf(kind) === category);
}

/**
 * Владелец типа события. `identity` — события учётной записи (вход, пароль, 2FA, действия
 * администратора над учётной записью): переедут в IdP вместе со входом, а tasker будет сливать
 * их со своими в ленты. `app` — пространства, содержимое, токены, агенты, имперсонация,
 * пространства в админке, настройки. Record требует владельца у каждого типа.
 */
export type AuditOwner = 'identity' | 'app';

export const AUDIT_EVENT_OWNERS: Record<AuditEventKind, AuditOwner> = {
  'auth.signed_up': 'identity',
  'auth.sign_in': 'identity',
  'auth.sign_in_failed': 'identity',
  'auth.sign_out': 'identity',
  'auth.password_reset_requested': 'identity',
  'auth.password_reset': 'identity',
  'auth.password_changed': 'identity',
  'auth.email_verified': 'identity',
  'auth.two_factor_enabled': 'identity',
  'auth.two_factor_disabled': 'identity',
  'auth.backup_codes_regenerated': 'identity',
  'auth.sessions_revoked': 'identity',
  // Привязка GitHub-аккаунта нужна для PR и остаётся в tasker.
  'auth.github_linked': 'app',
  'auth.github_unlinked': 'app',
  'token.issued': 'app',
  'token.revoked': 'app',
  'workspace.created': 'app',
  'workspace.renamed': 'app',
  'workspace.archived': 'app',
  'workspace.restored': 'app',
  'workspace.deleted': 'app',
  'workspace.member_joined': 'app',
  'workspace.member_removed': 'app',
  'workspace.member_role_changed': 'app',
  'workspace.member_permissions_changed': 'app',
  'workspace.invitation_sent': 'app',
  'workspace.invitation_canceled': 'app',
  'agent.created': 'app',
  'agent.disabled': 'app',
  'agent.enabled': 'app',
  'project.created': 'app',
  'project.archived': 'app',
  'project.restored': 'app',
  'project.deleted': 'app',
  'task.created': 'app',
  'task.archived': 'app',
  'task.restored': 'app',
  'task.deleted': 'app',
  'document.created': 'app',
  'document.deleted': 'app',
  'admin.user_banned': 'identity',
  'admin.user_unbanned': 'identity',
  // Глобальная роль admin и удаление пользователя остаются в tasker.
  'admin.user_role_changed': 'app',
  'admin.user_sessions_revoked': 'identity',
  'admin.user_session_revoked': 'identity',
  'admin.user_two_factor_reset': 'identity',
  'admin.user_deleted': 'app',
  'admin.user_email_verified': 'identity',
  'admin.password_reset_sent': 'identity',
  'admin.verification_sent': 'identity',
  'admin.user_token_revoked': 'app',
  'admin.impersonation_started': 'app',
  'admin.impersonation_stopped': 'app',
  'admin.workspace_archived': 'app',
  'admin.workspace_restored': 'app',
  'admin.workspace_deleted': 'app',
  'admin.workspace_owner_changed': 'app',
  'admin.workspace_quota_changed': 'app',
  'admin.settings_changed': 'app',
  'admin.test_mail_sent': 'app',
};

export function auditOwnerOf(kind: AuditEventKind): AuditOwner {
  return AUDIT_EVENT_OWNERS[kind];
}
