import 'server-only';

import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { organization } from 'better-auth/plugins/organization';
import { memberAc, ownerAc } from 'better-auth/plugins/organization/access';

import { auditRequestContext, recordAuditEvent } from '@/shared/audit';
import { prisma } from '@/shared/db';
import { getEnv } from '@/shared/env';
import { getGithubAppConfig, type GithubAppConfig } from '@/shared/github-app';
import { createLogger } from '@/shared/logger';

import { allowSessionCreation } from './agent-session-guard';
import { signInMethodFromRequest, signUpMethodFromRequest } from './auth-audit';
import { buildAuthRateLimitRules, isSignInProviderAllowed } from './auth-options';
import {
  buildOidcProviderConfig,
  OIDC_PROVIDER_ID,
  oidcSettingsFromEnv,
  type OidcSettings,
} from './oidc-config';
import { isOidcDiscoveryReady } from './oidc-discovery';

const log = createLogger('auth');

/** Срок жизни сессии и период её продления. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
const SESSION_COOKIE_CACHE_SECONDS = 60 * 5;

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
    // Принять приглашение можно только с подтверждённым email (вход через IdP его и требует):
    // иначе приглашение принял бы любой, кто завёл учётную запись на адрес приглашённого.
    requireEmailVerificationOnInvitation: true,
    schema: {
      organization: {
        modelName: 'workspace',
        additionalFields: {
          // Ключ задач (TSK-42). input: false — эндпоинты плагина поле не принимают,
          // его проставляет и меняет только сервис пространств (src/modules/workspaces/slices/workspace).
          taskKey: { type: 'string', required: false, input: false },
          // Пространство в архиве — так же, только сервис пространств.
          archivedAt: { type: 'date', required: false, input: false },
        },
      },
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

async function findIsAgent(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAgent: true } });
  return user?.isAgent ?? false;
}

/**
 * Провайдер GitHub (OAuth GitHub App) или ничего, если интеграция не настроена. Нужен для привязки
 * аккаунта из профиля (linkSocial) и токена пользователя; войти через него нельзя (hooks.before).
 */
function githubProvider(github: GithubAppConfig | null) {
  if (!github) return {};
  return { github: { clientId: github.clientId, clientSecret: github.clientSecret } };
}

/** Вход через IdP plwedding ID — когда IdP ответил на discovery (см. oidc-discovery). */
function oidcPlugins(oidc: OidcSettings | null) {
  return oidc ? [genericOAuth({ config: [buildOidcProviderConfig(oidc)] })] : [];
}

/**
 * Вход — только через IdP: GitHub подключён для привязки аккаунта, но начать через него вход
 * нельзя. Пароль, подтверждение email и 2FA — в IdP (emailAndPassword в tasker выключен).
 */
const signInProviderGuard = createAuthMiddleware((ctx) => {
  if (ctx.path !== '/sign-in/social') return Promise.resolve();
  const provider: unknown = (ctx.body as { provider?: unknown } | undefined)?.provider;
  if (isSignInProviderAllowed(provider, OIDC_PROVIDER_ID)) return Promise.resolve();
  log.warn(
    { provider: typeof provider === 'string' ? provider : null },
    '[auth.hooks] sign-in provider rejected',
  );
  throw new APIError('FORBIDDEN', {
    message: 'Вход возможен только через plwedding ID',
    code: 'SIGN_IN_PROVIDER_NOT_ALLOWED',
  });
});

function createAuth(github: GithubAppConfig | null, oidc: OidcSettings | null) {
  const env = getEnv();

  const auth = betterAuth({
    appName: 'Tasker',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    user: {
      additionalFields: {
        // Служебный пользователь-агент пространства. input: false — эндпоинты поле не принимают,
        // его проставляет только сервис агентов (src/modules/agents).
        isAgent: { type: 'boolean', defaultValue: false, required: false, input: false },
      },
    },
    hooks: { before: signInProviderGuard },
    // Токены пользователя GitHub нужны интеграции (проверка доступа к установке), поэтому хранятся
    // зашифрованными; истёкший токен GitHub App обновляет getAccessToken.
    socialProviders: githubProvider(github),
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // Неявная привязка по совпадению email — для входа через IdP: пользователь tasker,
        // заведённый до SSO, получает аккаунт plwedding при первом входе. Better Auth привязывает,
        // только если email подтверждён и в IdP (email_verified), и локально
        // (requireLocalEmailVerified). GitHub привязывается явно, из профиля (linkSocial).
        disableImplicitLinking: false,
        trustedProviders: [],
        // При явной привязке пользователь уже вошёл: email GitHub может отличаться от рабочего.
        allowDifferentEmails: true,
      },
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_SECONDS },
    },
    // Встроенный лимит действует только на HTTP-эндпоинты /api/auth/*: вызовы auth.api.* из
    // Server Actions его обходят и ограничиваются своим лимитером (src/shared/rate-limit).
    // Хранилище — БД: счётчики общие для всех процессов и переживают перезапуск.
    rateLimit: { enabled: true, storage: 'database', customRules: buildAuthRateLimitRules() },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      // За edge-Caddy адрес клиента — в X-Forwarded-For (Caddy перезаписывает заголовок).
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    databaseHooks: {
      user: {
        create: {
          // Своего допуска у tasker нет: регистрацию решает IdP. ADMIN_EMAILS — первый администратор.
          before: (user) => {
            if (!env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
              return Promise.resolve({ data: user });
            }
            log.info('[auth.hooks] new user promoted to admin via ADMIN_EMAILS');
            return Promise.resolve({ data: { ...user, role: 'admin' } });
          },
          after: async (user, context) => {
            log.info({ userId: user.id }, '[auth.hooks] user created');
            await recordAuditEvent({
              kind: 'auth.signed_up',
              actor: { actorId: user.id, actorName: user.name },
              data: { method: signUpMethodFromRequest(context) },
              request: context?.headers ? auditRequestContext(context.headers) : null,
            });
          },
        },
      },
      session: {
        create: {
          // Агент пространства (User.isAgent) не входит в интерфейс — в том числе через impersonation.
          before: async (session) => {
            const allowed = await allowSessionCreation(session, findIsAgent);
            return allowed ? undefined : false;
          },
          // Вход создаёт сессию — пишем здесь. Хук выполняется после коммита.
          // Сессию имперсонации пишет сервис администратора.
          after: async (session, context) => {
            if (session.impersonatedBy) return;
            await recordAuditEvent({
              kind: 'auth.sign_in',
              actor: { actorId: session.userId },
              data: { method: signInMethodFromRequest(context) },
              request: {
                ip: session.ipAddress ?? null,
                userAgent: session.userAgent?.slice(0, 300) ?? null,
              },
            });
          },
        },
      },
      account: {
        create: {
          // Привязка GitHub завершается в OAuth-callback, а не в сервисе профиля.
          after: async (account, context) => {
            if (account.providerId !== 'github') return;
            await recordAuditEvent({
              kind: 'auth.github_linked',
              actor: { actorId: account.userId },
              data: { login: null },
              request: context?.headers ? auditRequestContext(context.headers) : null,
            });
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
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
        defaultBanReason: 'Причина не указана',
        // Вход от имени пользователя — на час (см. modules/admin, IMPERSONATION_SESSION_SECONDS).
        impersonationSessionDuration: 60 * 60,
      }),
      workspacesPlugin(),
      ...oidcPlugins(oidc),
      nextCookies(),
    ],
  });

  log.info(
    {
      plugins: ['admin', 'organization', ...(oidc ? ['generic-oauth'] : []), 'next-cookies'],
      sessionTtlSeconds: SESSION_TTL_SECONDS,
      rateLimitStorage: 'database',
      github: github?.source ?? null,
      oidc: oidc ? { issuer: oidc.issuer, clientId: oidc.clientId } : null,
    },
    '[auth] better-auth initialized',
  );
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

// Singleton через globalThis: HMR в dev не пересоздаёт экземпляр.
const globalForAuth = globalThis as unknown as {
  auth?: Auth;
  authGithub?: GithubAppConfig | null;
  authOidcReady?: boolean;
};

/**
 * Экземпляр Better Auth (ленивый): создаётся при первом обращении, а не при импорте.
 * Пересоздаётся, когда сменился конфиг GitHub App (создан или удалён в админке) или IdP стал
 * доступен (loadOidcDiscovery): провайдеры входа задаются только при создании.
 */
export function getAuth(): Auth {
  const github = getGithubAppConfig();
  const oidc = oidcSettingsFromEnv(getEnv());
  const oidcReady = isOidcDiscoveryReady();
  if (
    !globalForAuth.auth ||
    globalForAuth.authGithub !== github ||
    globalForAuth.authOidcReady !== oidcReady
  ) {
    if (globalForAuth.auth) log.debug({ oidcReady }, '[auth] recreating better-auth instance');
    globalForAuth.auth = createAuth(github, oidcReady ? oidc : null);
    globalForAuth.authGithub = github;
    globalForAuth.authOidcReady = oidcReady;
  }
  return globalForAuth.auth;
}

/** Подключён ли вход через IdP: IdP ответил на discovery (см. loadOidcDiscovery). */
export function isOidcSignInAvailable(): boolean {
  return isOidcDiscoveryReady();
}
