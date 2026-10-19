import 'server-only';

import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { organization } from 'better-auth/plugins/organization';
import { memberAc, ownerAc } from 'better-auth/plugins/organization/access';
import { twoFactor } from 'better-auth/plugins/two-factor';

import { auditRequestContext, recordAuditEvent } from '@/shared/audit';
import { prisma } from '@/shared/db';
import { getEnv } from '@/shared/env';
import { getGithubAppConfig, type GithubAppConfig } from '@/shared/github-app';
import { createLogger } from '@/shared/logger';
import { sendMailInBackground } from '@/shared/mail';
import { evaluateSignup, SIGNUP_REJECTION_MESSAGES } from '@/shared/resource-settings';

import { allowSessionCreation } from './agent-session-guard';
import { signInMethodFromPath, signUpMethodFromPath } from './auth-audit';
import {
  buildPasswordResetEmail,
  buildSignUpAttemptEmail,
  buildVerificationEmail,
} from './auth-emails';
import { appUrl, sendPasswordChangedMail } from './auth-mail';
import { buildAuthRateLimitRules, buildSyntheticUser } from './auth-options';

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

/** Срок ссылки сброса пароля. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
/** Срок ссылки подтверждения email. */
export const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;

/**
 * Плагин organization под доменными именами (см. prisma/schema.prisma):
 * organization → Workspace, member → WorkspaceMember, invitation → WorkspaceInvitation,
 * organizationId → workspaceId. Роли пространства — только owner и member.
 * Дополнительные поля участника canManageProjects и canManageDocuments — тоже в prisma/schema.prisma.
 */
function workspacesPlugin(requireEmailVerification: boolean) {
  return organization({
    // Роль admin плагина не регистрируем: пригласить с ней нельзя. ac — встроенный defaultAc.
    roles: { owner: ownerAc, member: memberAc },
    creatorRole: 'owner',
    allowUserToCreateOrganization: (user) => !user.banned,
    organizationLimit: WORKSPACES_PER_USER_LIMIT,
    invitationExpiresIn: INVITATION_TTL_SECONDS,
    invitationLimit: PENDING_INVITATIONS_LIMIT,
    cancelPendingInvitationsOnReInvite: true,
    // Принять приглашение можно только с подтверждённым email: иначе его принял бы любой,
    // кто зарегистрировался с адресом приглашённого и получил ссылку.
    requireEmailVerificationOnInvitation: requireEmailVerification,
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

/** Провайдер GitHub (OAuth GitHub App) или ничего, если интеграция не настроена. */
function githubProvider(github: GithubAppConfig | null) {
  if (!github) return {};
  return { github: { clientId: github.clientId, clientSecret: github.clientSecret } };
}

function createAuth(github: GithubAppConfig | null) {
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
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // При обязательном подтверждении сессия после регистрации не создаётся (Better Auth).
      autoSignIn: true,
      requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // Письма — в фоне: время ответа не выдаёт, существует ли аккаунт. Ссылки и токены не логируем.
      sendResetPassword: async ({ user, url }, request) => {
        log.info({ userId: user.id }, '[auth.passwordReset] requested');
        // Автор неизвестен (письмо может запросить кто угодно) — пользователь только субъект.
        await recordAuditEvent({
          kind: 'auth.password_reset_requested',
          actor: null,
          targetUserId: user.id,
          data: {},
          request: request ? auditRequestContext(request.headers) : null,
        });
        sendMailInBackground(
          { to: user.email, ...buildPasswordResetEmail({ name: user.name, url }) },
          'password-reset',
        );
      },
      onPasswordReset: async ({ user }, request) => {
        log.info({ userId: user.id }, '[auth.passwordReset] completed');
        sendPasswordChangedMail(user);
        await recordAuditEvent({
          kind: 'auth.password_reset',
          actor: { actorId: user.id, actorName: user.name },
          data: {},
          request: request ? auditRequestContext(request.headers) : null,
        });
      },
      // Регистрация на занятый адрес отвечает как успешная; владельцу адреса — письмо.
      onExistingUserSignUp: ({ user }) => {
        log.info({ userId: user.id }, '[auth.signUp] existing email attempt');
        sendMailInBackground(
          {
            to: user.email,
            ...buildSignUpAttemptEmail({
              name: user.name,
              loginUrl: `${appUrl()}/login`,
              forgotPasswordUrl: `${appUrl()}/forgot-password`,
            }),
          },
          'sign-up-attempt',
        );
        return Promise.resolve();
      },
      customSyntheticUser: buildSyntheticUser,
    },
    emailVerification: {
      sendOnSignUp: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
      // Вход с неподтверждённым email отклоняется, а письмо уходит повторно.
      sendOnSignIn: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
      autoSignInAfterVerification: true,
      expiresIn: EMAIL_VERIFICATION_TTL_SECONDS,
      sendVerificationEmail: ({ user, url }) => {
        log.info({ userId: user.id }, '[auth.emailVerification] sent');
        sendMailInBackground(
          { to: user.email, ...buildVerificationEmail({ name: user.name, url }) },
          'email-verification',
        );
        return Promise.resolve();
      },
      afterEmailVerification: async (user, request) => {
        log.info({ userId: user.id }, '[auth.emailVerification] verified');
        await recordAuditEvent({
          kind: 'auth.email_verified',
          actor: { actorId: user.id, actorName: user.name },
          data: {},
          request: request ? auditRequestContext(request.headers) : null,
        });
      },
    },
    // Вход через GitHub — только если настроено GitHub App (GITHUB_* или админка; см. docs/github.md).
    // Токены пользователя нужны интеграции (проверка доступа к установке), поэтому хранятся
    // зашифрованными; истёкший токен GitHub App обновляет getAccessToken.
    socialProviders: githubProvider(github),
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // Неявная привязка по совпадению email позволила бы захватить аккаунт, зарегистрированный
        // до подтверждения email или с выключенным AUTH_REQUIRE_EMAIL_VERIFICATION. GitHub
        // привязывается только явно, из профиля (linkSocial).
        disableImplicitLinking: true,
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
          before: async (user, context) => {
            const isAdminEmail = env.ADMIN_EMAILS.includes(user.email.toLowerCase());
            // Правила регистрации из настроек ресурса. Форма регистрации проверяет их заранее
            // (credentials.signUp), здесь — для входа через GitHub и как страховка.
            // Пользователей, созданных администратором, они не касаются.
            if (context?.path !== '/admin/create-user') {
              const rejection = await evaluateSignup({ email: user.email, isAdminEmail });
              if (rejection) {
                // В колбэке OAuth ошибка хука ушла бы JSON-ответом: возвращаем на /login?error=.
                if (context?.path?.includes('callback')) {
                  throw context.redirect(`${appUrl()}/login?error=signup_${rejection}`);
                }
                throw new APIError('FORBIDDEN', {
                  message: SIGNUP_REJECTION_MESSAGES[rejection],
                  code: `SIGNUP_${rejection.toUpperCase()}`,
                });
              }
            }
            if (!isAdminEmail) return { data: user };
            log.info('[auth.hooks] new user promoted to admin via ADMIN_EMAILS');
            return { data: { ...user, role: 'admin' } };
          },
          after: async (user, context) => {
            log.info({ userId: user.id }, '[auth.hooks] user created');
            await recordAuditEvent({
              kind: 'auth.signed_up',
              actor: { actorId: user.id, actorName: user.name },
              data: { method: signUpMethodFromPath(context?.path) },
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
          // Вход любым способом (пароль, GitHub, второй шаг 2FA) создаёт сессию — пишем здесь.
          // Хук выполняется после коммита. Сессию имперсонации пишет сервис администратора.
          after: async (session, context) => {
            if (session.impersonatedBy) return;
            await recordAuditEvent({
              kind: 'auth.sign_in',
              actor: { actorId: session.userId },
              data: { method: signInMethodFromPath(context?.path) },
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
          // Привязка GitHub завершается в OAuth-callback, а не в сервисе профиля. При регистрации
          // через GitHub событие тоже пишется — рядом с auth.signed_up.
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
      workspacesPlugin(env.AUTH_REQUIRE_EMAIL_VERIFICATION),
      // 2FA (TOTP + резервные коды) — только для входа по email и паролю (см. docs/architecture.md).
      twoFactor({
        issuer: 'Tasker',
        skipVerificationOnEnable: false,
        backupCodeOptions: { amount: 10 },
      }),
      nextCookies(),
    ],
  });

  log.info(
    {
      plugins: ['admin', 'organization', 'two-factor', 'next-cookies'],
      sessionTtlSeconds: SESSION_TTL_SECONDS,
      rateLimitStorage: 'database',
      emailVerificationRequired: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
      github: github?.source ?? null,
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
};

/**
 * Экземпляр Better Auth (ленивый): создаётся при первом обращении, а не при импорте.
 * Пересоздаётся, когда сменился конфиг GitHub App (создан или удалён в админке):
 * провайдер входа через GitHub задаётся только при создании.
 */
export function getAuth(): Auth {
  const github = getGithubAppConfig();
  if (!globalForAuth.auth || globalForAuth.authGithub !== github) {
    globalForAuth.auth = createAuth(github);
    globalForAuth.authGithub = github;
  }
  return globalForAuth.auth;
}
