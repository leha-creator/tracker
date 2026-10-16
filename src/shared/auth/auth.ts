import 'server-only';

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { organization } from 'better-auth/plugins/organization';
import { memberAc, ownerAc } from 'better-auth/plugins/organization/access';

import { prisma } from '@/shared/db';
import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

const log = createLogger('auth');

/** Срок жизни сессии и период её продления. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
const SESSION_COOKIE_CACHE_SECONDS = 60 * 5;

// Должны совпадать с src/modules/auth/slices/credentials/credentials.schema.ts
// (схема используется и в клиентских формах, поэтому не импортирует server-only код).
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/** Срок действия приглашения в пространство. */
export const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7;
const WORKSPACES_PER_USER_LIMIT = 50;
const PENDING_INVITATIONS_LIMIT = 100;

/**
 * Плагин organization под доменными именами (см. prisma/schema.prisma):
 * organization → Workspace, member → WorkspaceMember, invitation → WorkspaceInvitation,
 * organizationId → workspaceId. Роли пространства — только owner и member.
 * Дополнительные поля участника canManageProjects и canManageDocuments — тоже в prisma/schema.prisma.
 */
function workspacesPlugin() {
  return organization({
    // Роль admin плагина не регистрируем: пригласить с ней нельзя. ac — встроенный defaultAc.
    roles: { owner: ownerAc, member: memberAc },
    creatorRole: 'owner',
    allowUserToCreateOrganization: (user) => !user.banned,
    organizationLimit: WORKSPACES_PER_USER_LIMIT,
    invitationExpiresIn: INVITATION_TTL_SECONDS,
    invitationLimit: PENDING_INVITATIONS_LIMIT,
    cancelPendingInvitationsOnReInvite: true,
    schema: {
      organization: { modelName: 'workspace' },
      member: {
        modelName: 'workspaceMember',
        fields: { organizationId: 'workspaceId' },
        additionalFields: {
          // Право управлять проектами. input: false — эндпоинты плагина поле не принимают,
          // его меняет только сервис участников (src/modules/workspaces/slices/member).
          canManageProjects: {
            type: 'boolean',
            defaultValue: false,
            required: false,
            input: false,
          },
          // Право управлять документами — так же, как canManageProjects.
          canManageDocuments: {
            type: 'boolean',
            defaultValue: false,
            required: false,
            input: false,
          },
        },
      },
      invitation: { modelName: 'workspaceInvitation', fields: { organizationId: 'workspaceId' } },
      session: { fields: { activeOrganizationId: 'activeWorkspaceId' } },
    },
    organizationHooks: {
      afterCreateOrganization: ({ organization: workspace, user }) => {
        log.info(
          { workspaceId: workspace.id, userId: user.id },
          '[auth.organization] workspace created',
        );
        return Promise.resolve();
      },
      afterAcceptInvitation: ({ organization: workspace, user }) => {
        log.info(
          { workspaceId: workspace.id, userId: user.id },
          '[auth.organization] invitation accepted',
        );
        return Promise.resolve();
      },
      afterRemoveMember: ({ organization: workspace, user }) => {
        log.info(
          { workspaceId: workspace.id, userId: user.id },
          '[auth.organization] member removed',
        );
        return Promise.resolve();
      },
    },
  });
}

function createAuth() {
  const env = getEnv();

  const auth = betterAuth({
    appName: 'Tasker',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      autoSignIn: true,
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_SECONDS },
    },
    // Встроенный лимит действует только на HTTP-эндпоинты /api/auth/*.
    // Вызовы auth.api.* из Server Actions его обходят (см. docs/architecture.md).
    rateLimit: { enabled: true, storage: 'memory' },
    advanced: { useSecureCookies: env.NODE_ENV === 'production' },
    databaseHooks: {
      user: {
        create: {
          before: (user) => {
            if (!env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
              return Promise.resolve({ data: user });
            }
            log.info('[auth.hooks] new user promoted to admin via ADMIN_EMAILS');
            return Promise.resolve({ data: { ...user, role: 'admin' } });
          },
          after: (user) => {
            log.info({ userId: user.id }, '[auth.hooks] user created');
            return Promise.resolve();
          },
        },
      },
    },
    logger: {
      level: env.LOG_LEVEL === 'trace' || env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
      // Аргументы Better Auth могут содержать данные запроса — пишем их только на DEBUG.
      log: (level, message, ...args) => {
        if (level === 'debug') log.debug({ args }, `[better-auth] ${message}`);
        else log[level](`[better-auth] ${message}`);
      },
    },
    // nextCookies() — последним: выставляет cookie из Server Actions.
    plugins: [
      // Без причины плагин записал бы «No reason»; причину показывает админка.
      admin({ defaultRole: 'user', adminRoles: ['admin'], defaultBanReason: 'Причина не указана' }),
      workspacesPlugin(),
      nextCookies(),
    ],
  });

  log.info(
    { plugins: ['admin', 'organization', 'next-cookies'], sessionTtlSeconds: SESSION_TTL_SECONDS },
    '[auth] better-auth initialized',
  );
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

// Singleton через globalThis: HMR в dev не пересоздаёт экземпляр.
const globalForAuth = globalThis as unknown as { auth?: Auth };

/** Экземпляр Better Auth (ленивый): создаётся при первом обращении, а не при импорте. */
export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
