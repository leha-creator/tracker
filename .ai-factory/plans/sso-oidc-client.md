# План реализации: единый вход (SSO) через IdP auth.plwedding.ru

Branch: none (`git.create_branches: false`, работа в текущей ветке)
Created: 2026-10-21

## Settings
- Testing: yes — Vitest (`environment: node`) для чистых функций: конфиг провайдера из env, сопоставление claims, адрес фото IdP, способ входа по пути, решение о выходе через IdP, повтор discovery; в заблокированных фазах — слияние лент журнала и проверка logout-токена. Живой вход проверить вручную с локальным IdP.
- Logging: verbose — `createLogger('auth:oidc')`: `info` — discovery получен, вход/регистрация через IdP, выход с переходом в IdP; `warn` — discovery недоступен (провайдер пропущен, следующая попытка через N с), отказ `email_not_verified` / `account_not_linked`; `debug` — сопоставление claims (без email целиком — `maskEmail()`), решение о выходе. Коды, токены, `state`, `nonce`, `id_token_hint` в логи не попадают: добавить в `REDACT_PATHS`.
- Docs: yes — обязательный шаг документации в конце (`/aif-docs`).

## Roadmap Linkage
Milestone: "Единый вход (SSO)"
Rationale: план покрывает все четыре подпункта этапа; журнал через IdP и back-channel logout заблокированы этапами IdP.

## Контекст и принятые решения

**Состояние IdP** (`D:\work\auth`): готовы учётные записи и OIDC-провайдер. Страница аккаунта `/account` в работе. Журнал безопасности, Admin API, межсервисная аутентификация, «Выход и блокировка» и перенос пользователей не начаты. Кроме OIDC и публичного роута аватара, API у IdP нет.

**Контракт callback изменён в IdP** (сделано при планировании, в `D:\work\auth` не закоммичено). В better-auth 1.7.6 у `genericOAuth` нет своего маршрута `/oauth2/callback/:id`: провайдер регистрируется как social, ответ приходит на ядро `/callback/:id`. Поэтому redirect_uri клиентов `tasker` и `meet` теперь `<origin>/api/auth/callback/plwedding`. Изменены `src/modules/oidc/models/clients.ts`, тесты, `scripts/oidc-smoke.mjs`, `docs/oidc-clients.md`, `.env.example`. Клиенты обновляются upsert при старте IdP, так что его нужно перезапустить. В `ROADMAP.md` tasker в подпункте «Подключение клиента» остался старый путь: поправить через `/aif-roadmap`.

**Решения:**
- Активных пользователей нет. Поэтому переходного режима нет: фаза 1 подключает IdP рядом с паролем, фаза 2 удаляет локальный вход целиком. Перенос истории журнала и аккаунтов не нужен.
- `genericOAuth` (`better-auth/plugins/generic-oauth`):
  - `providerId: 'plwedding'`, `discoveryUrl: <OIDC_ISSUER>/.well-known/openid-configuration`, `clientId`;
  - `clientSecret`, `authentication: 'basic'` (`client_secret_basic`, по умолчанию было бы `post`);
  - `scopes: ['openid','email','profile']`, `pkce: true`, `requireIdTokenVerification: true`;
  - `requireEmailVerification: true` — без подтверждённого email в IdP сессии нет;
  - `overrideUserInfo: true` — имя, email и фото обновляются при каждом входе;
  - `postLogoutRedirectURI: '/login'`.
- Вход клиента: `api.signInSocial({ provider: 'plwedding', ... })`. Выход: `api.signOut` возвращает `url` на `end_session_endpoint` с `id_token_hint` из `Account.idToken`.
- **Discovery читается один раз при создании `betterAuth`.** Если IdP недоступен, провайдер молча пропускается. Поэтому `getAuth()` сам проверяет discovery с таймаутом. При неудаче auth создаётся без провайдера, через 30 с экземпляр пересоздаётся (тот же механизм, что при смене конфига GitHub App).
- **Привязка по email:** `accountLinking.disableImplicitLinking: false`, `trustedProviders: []` (нужен `email_verified` от IdP). Вход через GitHub в tasker в фазе 2 закрывается хуком, так что неявная привязка остаётся только у IdP. Явная привязка GitHub для PR (`linkSocial`, `allowDifferentEmails`) не меняется.
- **Глобальная роль `admin` локальная.** Claim `groups` не синхронизируется. `ADMIN_EMAILS` по-прежнему повышает роль при создании пользователя.
- **Своего допуска поверх IdP нет:** `evaluateSignup` для пути `/callback/plwedding` не вызывается. В фазе 2 он удаляется.
- **Фото из IdP.** `UserAvatar` грузит только адреса приложения (`isAvatarUrl`). Поэтому `mapProfileToUser` превращает `picture` вида `<issuer>/api/users/<sub>/avatar?v=X` в `/api/idp-avatar/<sub>?v=X`. Новый роут отдаёт 302 на IdP. Прочие `picture` (например, аватар GitHub) отбрасываются, остаются инициалы.
- **Локальные сессии остаются** (7 дней, cookie-кеш 5 мин). Пока нет back-channel logout, бан или выход в IdP не гасит сессию tasker. Это известное ограничение до фазы 4.
- **Имперсонация остаётся.** Выход под имперсонацией не идёт в `end_session_endpoint`: там `id_token_hint` чужого пользователя.
- Агенты (`isAgent`), API-токены, роли пространств, `UserProfile` (должность, описание), привязка GitHub для PR, бан и роль в админке остаются локальными.
- `/api/health` не проверяет IdP, чтобы деплой tasker не зависел от доступности IdP.

## Tasks

### Фаза 1 — подключение клиента (IdP рядом с паролем)

- [x] **Задача 1. Env и конфиг провайдера**
  - `src/shared/env/env.ts`: `OIDC_ISSUER` (url, без `/` в конце), `OIDC_CLIENT_ID` (по умолчанию `tasker`), `OIDC_CLIENT_SECRET` (min 32). `OIDC_ISSUER` и `OIDC_CLIENT_SECRET` задаются вместе или не задаются (как `GITHUB_*`). Производный флаг `OIDC_ENABLED`. Тесты — в `env.test.ts`.
  - Новый `src/shared/auth/oidc-config.ts`: чистая `buildOidcProviderConfig(env, discovery)` → `GenericOAuthConfig` с параметрами из раздела «Решения». Константа `OIDC_PROVIDER_ID = 'plwedding'`. `idpAccountUrl(issuer)` → `<issuer>/account`.
  - `.env.example`: блок `OIDC_*` с комментарием про локальный IdP (порт 3005, `OIDC_TASKER_ORIGIN=http://localhost:3000` в env IdP, общий секрет).
  - Логи: при старте `info` «OIDC включён» с issuer и clientId, без секрета.
  - Тест: `oidc-config.test.ts`.

- [x] **Задача 2. Discovery с повтором и подключение `genericOAuth`** (зависит от 1)
  - `src/shared/auth/oidc-discovery.ts`:
    - `loadOidcDiscovery(issuer)` — fetch с таймаутом 5 с, проверка `issuer`, `jwks_uri`, `authorization_endpoint`, `token_endpoint`, `end_session_endpoint`;
    - кеш процесса;
    - чистая `nextDiscoveryAttempt(state, now)` — повтор через 30 с после неудачи.
  - `src/shared/auth/auth.ts`:
    - `createAuth(github, oidc)` подключает `genericOAuth({ config: [buildOidcProviderConfig(...)] })`, если OIDC включён и discovery получен;
    - `getAuth()` пересоздаёт экземпляр, когда discovery появился (по образцу `loadGithubAppConfig()`);
    - `src/app/api/auth/[...all]/route.ts` и `session.ts` перед `getAuth()` ждут `loadOidcDiscovery()`.
  - `account.accountLinking`: `disableImplicitLinking: false`, `trustedProviders: []`, `allowDifferentEmails: true` оставить для явной привязки GitHub.
  - Хук `user.create.before`: для `context.path` = `/callback/plwedding` не вызывать `evaluateSignup`; `ADMIN_EMAILS` по-прежнему повышает роль.
  - `src/shared/logger`: в `REDACT_PATHS` добавить `idToken`, `id_token`, `id_token_hint`, `code`, `state`, `nonce`, `code_verifier`.
  - Логи: `info` — discovery получен; `warn` — неудача (причина, время следующей попытки); `debug` — пересоздание экземпляра.
  - Тест: `oidc-discovery.test.ts` (повтор, проверка полей).

- [x] **Задача 3. Сопоставление claims и фото IdP** (зависит от 1)
  - `src/shared/auth/oidc-profile.ts`: чистая `mapIdpProfile(profile, issuer)` → `{ name, email, emailVerified, image }`:
    - `name` — из `name`, иначе часть email до `@`;
    - `image` — `/api/idp-avatar/<sub>?v=<v>`, только если `picture` совпадает с `<issuer>/api/users/<sub>/avatar?v=…`, иначе `null`.
  - Подключить как `mapProfileToUser` в конфиге из задачи 1.
  - `src/modules/profiles/models/avatar.ts`: `isAvatarUrl` принимает и `/api/idp-avatar/<sub>?v=…`; `idpAvatarUrl(sub, v)`.
  - Новый `src/app/api/idp-avatar/[sub]/route.ts`: GET, `requireUser`, проверка формата `sub` и `v`, 302 на `<OIDC_ISSUER>/api/users/<sub>/avatar?v=<v>`, долгий `Cache-Control`. При выключенном OIDC — 404.
  - Логи: `debug` — сопоставление (`maskEmail`, есть ли фото).
  - Тесты: `oidc-profile.test.ts`, дополнить `avatar.test.ts`.

- [x] **Задача 4. Вход через IdP** (зависит от 2)
  - `src/modules/auth/slices/social/`:
    - `isIdpSignInEnabled()` — OIDC включён и провайдер есть в текущем экземпляре;
    - `startIdpSignIn(returnTo)` → `api.signInSocial({ provider: 'plwedding', callbackURL: safe returnTo, errorCallbackURL: '/login?returnTo=…', newUserCallbackURL })`;
    - `signInWithIdpAction`, сообщения ошибок callback (`email_not_verified`, `account_not_linked`, `unable_to_get_user_info`, IdP недоступен) в `social.messages.ts`.
  - Экспорт из `index.ts` / `client.ts`.
  - `src/components/auth/idp-sign-in.tsx` (сервер) и `idp-sign-in-button.tsx`: кнопка «Войти через plwedding ID», первая на `/login` и `/register`. Если IdP недоступен — `Callout` «Вход через единую учётную запись временно недоступен».
  - `src/shared/auth/auth-audit.ts`: `signInMethodFromPath` / `signUpMethodFromPath` → `'oidc'` для `/callback/plwedding`, `'github'` только для `/callback/github`. В `audit-catalog.ts` значение `oidc` добавить в `SIGN_IN_METHODS` и в enum `auth.signed_up.method`, подписи — в `describeAuditEvent`.
  - Логи: `info` — старт входа (returnTo без query); `warn` — ошибка callback по коду.
  - Тесты: `auth-audit.test.ts`, `social.messages.test.ts`.

- [x] **Задача 5. Выход через IdP** (зависит от 2)
  - `credentials.service.ts` `signOut()`: `api.signOut({ headers, body: { callbackURL: '/login' } })` возвращает `url`. Чистая `resolveSignOutRedirect({ url, impersonating })` возвращает `url` IdP, а под имперсонацией и без `url` — `/login`.
  - `signOutAction` делает `redirect()` на результат. Внешний URL допустим только с origin `OIDC_ISSUER`, проверка — в той же функции.
  - Логи: `info` — выход (через IdP или локально); `debug` — причина пропуска выхода в IdP.
  - Тест: `resolveSignOutRedirect`.

**Commit 1** (после задач 1–5): `feat(auth): sign in through plwedding IdP via genericOAuth`

- [x] **Задача 6. Ручная проверка с локальным IdP** (зависит от 4, 5)
  - IdP: `BETTER_AUTH_URL=http://localhost:3005`, `OIDC_TASKER_CLIENT_SECRET`, `OIDC_TASKER_ORIGIN=http://localhost:3000`, `pnpm exec next dev -p 3005`.
  - Сценарии:
    - новый пользователь → регистрация в IdP → пользователь в tasker с именем и фото;
    - существующий пользователь tasker с тем же подтверждённым email → привязка без дубля;
    - неподтверждённый email → сообщение;
    - выход → IdP → `/login`;
    - выход под имперсонацией;
    - IdP выключен при старте tasker → `Callout`; IdP поднят → через 30 с кнопка работает.
  - Найденное — исправить в рамках задач 2–5.

### Фаза 2 — только IdP, удаление локального входа

- [x] **Задача 7. Конфиг Better Auth без пароля и 2FA** (зависит от 6)
  - `auth.ts`:
    - убрать `emailAndPassword`, `emailVerification`, плагин `twoFactor`, `socialProviders.github` как способ входа (провайдер GitHub оставить только для `linkSocial`, см. ниже);
    - убрать `customSyntheticUser`, хук `evaluateSignup` и правила лимитов удалённых эндпоинтов в `auth-options.ts`.
  - GitHub-провайдер нужен для `linkSocial` и `getAccessToken`. Чтобы им нельзя было войти, `hooks.before`: `/sign-in/social` с `provider !== 'plwedding'` → `APIError FORBIDDEN`.
  - Env: OIDC обязателен (`OIDC_ISSUER`, `OIDC_CLIENT_SECRET`), `AUTH_REQUIRE_EMAIL_VERIFICATION` удалить. `.env.example`, `deploy/tasker/.env.example`, `compose.app.yml`, CI (`.github/workflows/ci.yml`): фиктивные `OIDC_*` для сборки и smoke — health от IdP не зависит.
  - Удалить `auth-emails.ts` и его тест, `verifyEmailCallbackPath`, `sendPasswordChangedMail`.
  - Логи: `warn` — отклонённый вход через GitHub (`hooks.before`).
  - Тест: чистая функция решения хука (`isSignInProviderAllowed`).

- [x] **Задача 8. Удалить локальные страницы и срезы входа** (зависит от 7)
  - Удалить:
    - `src/app/(auth)/register`, `forgot-password`, `reset-password`, `verify-email`, `login/two-factor`;
    - срезы `credentials` (кроме выхода), `password`, `verification`, `two-factor`;
    - `models/two-factor.ts`;
    - компоненты `sign-in-form`, `sign-up-form`, `forgot-password-form`, `reset-password-form`, `resend-verification-form`, `two-factor-sign-in-form`, `github-sign-in*`, `components/profile/security/{change-password-form,two-factor-section,totp-qr-code,backup-codes}`;
    - тесты удалённого, пакет `qrcode`.
  - Выход перенести в срез `session` (`signOutAction`); вход через IdP — в срез `sso` (бывший `social`).
  - `/login` — только кнопка IdP, сообщение об ошибке callback и `resolveAuthPageReturnTo`.
  - `src/proxy.ts`: `PUBLIC_PATHS = ['/login']`.
  - `/profile/security`:
    - ссылка «Пароль, 2FA и сессии в plwedding ID» → `idpAccountUrl()`;
    - список сессий tasker с подписью «Сеансы в Tasker»;
    - журнал безопасности остаётся.
  - `/profile/account`: имя и email — только чтение со ссылкой на IdP; привязка GitHub остаётся.
  - Профиль: убрать правку имени и загрузку фото (`profiles/slices/avatar`, presigned POST, `updateAuthUser` для имени и фото). `UserProfile` (должность, описание) остаётся.
  - `src/modules/auth/index.ts` и `client.ts`, `AGENTS.md`-описание модуля — оставшиеся экспорты.
  - Логи: новых нет.

- [x] **Задача 9. Админка без операций IdP** (зависит от 7)
  - `src/modules/admin/slices/user`:
    - удалить `resetUserTwoFactor`, `verifyUserEmail`, `sendPasswordResetEmail`, `resendVerificationEmail` и их пункты меню и диалоги;
    - в карточке пользователя — ссылка на IdP вместо статуса 2FA и подтверждения email.
  - Бан, роль, отзыв сессий, удаление, имперсонация остаются.
  - Порт `modules/auth/slices/account`: убрать `markEmailVerifiedBySystem`, `resetTwoFactorBySystem`; из `getAccountMetrics` — `failedSignIns`, плитку на обзоре тоже.
  - `src/shared/resource-settings`: удалить группу «Регистрация» (`signup-policy`, `signup-settings`, форма в `/admin/settings`, `checkSignup` в `client.ts`), «Хранилище» остаётся.
  - Каталог журнала: события удалённых действий не удалять — `describeAuditEvent` должен показывать старые записи; пометить комментарием «только история».
  - Тесты: обновить `user.service.test.ts`, `signup-policy.test.ts` удалить.

- [x] **Задача 10. Миграция БД** (зависит от 8, 9)
  - `prisma/schema.prisma`: удалить `TwoFactor`, `User.twoFactorEnabled`, поля политики регистрации в `ResourceSettings`, ключ фото в `UserProfile`. `Verification` оставить: Better Auth хранит в ней `state` OAuth.
  - Миграция `pnpm db:migrate --name drop_local_auth`: дополнительно `DELETE FROM account WHERE "providerId" = 'credential'`.
  - Проверить, что `prisma migrate deploy` проходит на чистой базе (CI job).

**Commit 2** (после задач 7–10): `feat(auth)!: sign in only through plwedding IdP`

- [ ] **Задача 11. Справка и скриншоты** (зависит от 8)
  - `content/help/`: статьи о регистрации, входе, 2FA и сбросе пароля переписать под вход через IdP (ссылки на страницу аккаунта IdP), каталог `help-catalog.ts`.
  - `scripts/help-screenshots`:
    - засев пользователей через UI регистрации заменить регистрацией в локальном IdP (адрес из `HELP_IDP_URL`) и входом в tasker кнопкой IdP;
    - письма подтверждения — из Mailpit IdP (`http://localhost:8026`);
    - переснять затронутые статьи (`--only=<article>`).
  - Тест целостности ссылок и картинок справки должен пройти.
  - Статус: тексты и скрипт обновлены (register.png и two-factor-qr.png удалены); пересъёмка login, security, profile — после запуска локального IdP с чистой базой (`pnpm help:screenshots --only=getting-started`, `account-security`, `profile-and-notifications`).

### Фаза 3 — журнал и операции админки через IdP

Контракт IdP (`D:\work\auth\docs\oidc-clients.md` «API журнала безопасности», `docs\admin-api.md`, `docs\user-migration.md` «Что сделать в tasker»):
- аутентификация — `Authorization: Basic base64(client_id:client_secret)` (секрет клиента `tasker`); администратор — `actor` (его `sub`), IdP сам проверяет роль `admin` в IdP;
- журнал: `GET /api/audit/users/<sub>/events?cursor=` (свой) и `GET /api/audit/admin/users/<sub>/events?actor=&cursor=` (для админки); до 50 событий, новые сверху, готовые `text`/`details`, `nextCursor` = `<ISO>_<id>`; глобальной ленты нет;
- Admin API: `/api/admin/users/<sub>` (состояние), `ban`, `unban`, `role`, `two-factor/reset`, `email/verify`, `emails/password-reset`, `emails/verification`, `sessions/revoke`; ошибки `{ error: { code, message } }`; события `admin.*` пишет IdP;
- история `owner = identity` перенесена в IdP с теми же `id`; `auth.sign_in`/`auth.signed_up` способом `oidc` IdP заменил своим `auth.oidc_authorized`.

Решения (2026-10-21, с пользователем):
- `sub` пользователя — `Account.accountId` провайдера `plwedding`; нет связи — операции IdP недоступны (понятная ошибка), лента — только локальная.
- Роль меняется в IdP и локально. Бан, разбан и «Завершить все сессии» — в IdP и локально (локальный бан — отказ в сессии tasker, пока нет back-channel logout). Возвращаются сброс 2FA, подтверждение email и письма — только через IdP.
- Сессии в карточке — один список: сеансы в Tasker. Одна сессия завершается локально; «Завершить все» — и в IdP.
- Локальные ленты показывают только типы `owner = app`; события `identity` — только из IdP. Сеансы Tasker (`auth.sessions_revoked`, `admin.user_session_revoked`) становятся `app`. tasker перестаёт писать `auth.sign_in`, `auth.signed_up`, `auth.sign_out` и события `admin.*`, которые пишет IdP (`user_banned`, `user_unbanned`, `user_role_changed`, `user_sessions_revoked` и новые действия).
- Общий журнал `/admin/activity` без фильтра по пользователю — только локальные события (у IdP нет общей ленты); с фильтром по пользователю и в карточке — слияние.

- [x] **Задача 12. Клиент IdP и слияние лент журнала**
  - `src/shared/idp/`: `idpRequest` (Basic, таймаут 5 с, `no-store`, разбор ошибки в `IdpApiError`), сопоставление `sub` ⇄ `userId`, чтение журнала (`listIdpUserEvents`, `listIdpAdminUserEvents`, схема ответа Zod).
  - `src/modules/audit/models`: курсор ленты из двух частей (`parseFeedCursor`, `encodeFeedCursor`) и чистая `mergeAuditFeed` (дубли по `id`, остановка, когда буфер одной стороны кончился раньше неё).
  - `listMySecurityEvents` и `listAdminAuditEvents` (с `userId`): локальные `owner = app` + события IdP; IdP недоступен — `identityUnavailable` в ответе и `Callout` в ленте.
  - Каталог: владелец сеансов Tasker — `app`; хуки и сервисы не пишут события, которые пишет IdP.
  - Логи: `warn` — IdP недоступен (статус, код), `debug` — размеры страниц.
  - Тесты: курсор, `mergeAuditFeed`, разбор ответа IdP, ошибки клиента.

- [x] **Задача 13. Операции над учётной записью через Admin API IdP**
  - `src/modules/admin/admin-api.ts` → `callIdpAdmin(actor, target, …)` поверх `shared/idp`; ошибки IdP → доменные (`VALIDATION_ERROR` → `ValidationError`, `FORBIDDEN` → `ForbiddenError`, `NOT_FOUND` → `NotFoundError`, `RATE_LIMITED` → `RateLimitError`).
  - Бан, разбан, роль, завершение всех сессий — IdP, затем плагин `admin` локально. Сброс 2FA, подтверждение email, письма сброса и подтверждения — только IdP; пункты меню по состоянию из `GET /api/admin/users/<sub>`.
  - Карточка: бейджи «Email подтверждён»/«2FA» из IdP; IdP недоступен — без них и без IdP-пунктов.
  - Логи: `info` — операция выполнена; `warn` — отказ IdP с кодом; `error` — сбой связи.
  - Тесты: сервис пользователя (IdP + локально, нет `sub`), разбор ошибок.

### Фаза 4 — back-channel logout (ЗАБЛОКИРОВАНО)

Блокер: этап IdP «Выход и блокировка» (`backchannel_logout_uri` клиента).

- [ ] **Задача 14. Приёмник `POST /api/auth/backchannel-logout`**
  - Route Handler вне `[...all]`.
  - Проверка `logout_token` через `jose` (явная зависимость): JWKS из discovery, `iss`, `aud = clientId`, `typ: logout+jwt`, событие `http://schemas.openid.net/event/backchannel-logout`, нет `nonce`, `exp`, одноразовый `jti` (таблица или `Verification` с TTL).
  - По `sub` найти `Account` провайдера `plwedding` и удалить все сессии пользователя.
  - Сократить `cookieCache` до 1 мин.
  - Логи: `info` — сессии погашены (userId, число); `warn` — отклонённый токен (причина, без самого токена).
  - Тест: чистая проверка claims logout-токена.

## Commit Plan
- **Commit 1** (после задач 1–5): `feat(auth): sign in through plwedding IdP via genericOAuth`
- **Commit 2** (после задач 7–10): `feat(auth)!: sign in only through plwedding IdP`
- **Commit 3** (после задачи 11 и документации): `docs(auth): single sign-on and help articles`
- Фазы 3 и 4 — отдельными коммитами после разблокировки.

## Документация (обязательный шаг)
- `docs/configuration.md` — `OIDC_*`, локальный IdP на 3005.
- `docs/getting-started.md` — первый вход и администратор через IdP.
- `docs/architecture.md` — «Аутентификация и доступ», «Безопасность аутентификации» (что ушло в IdP, ограничение без back-channel logout), «Журнал действий», «Администрирование», `/api/idp-avatar`.
- `docs/production.md` — секрет `OIDC_CLIENT_SECRET` в `/opt/tasker/.env` = `OIDC_TASKER_CLIENT_SECRET` IdP.
- `AGENTS.md` — модуль `auth`, страницы `(auth)`, роут `idp-avatar`, команды.
