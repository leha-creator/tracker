# План реализации: Безопасность аутентификации

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-17

## Settings
- Testing: yes — Vitest (`environment: node`) для чистых функций, Zod-схем, маппинга ошибок, лимитера и сервисов с моками `getAuth()`/Prisma. UI проверить вручную через Mailpit (http://localhost:8025) и скриншоты Playwright на 1440 и 375 px.
- Logging: verbose — `createLogger(scope)`. `debug` — ход сценария, `info` — успешные события безопасности (сброс пароля, подтверждение email, включение/выключение 2FA, завершение сессий), `warn` — отказы (лимит, неверный код, неверный/просроченный токен), `error` — сбои почты и БД. Никогда не логировать пароли, токены, ссылки из писем, TOTP-секреты, коды 2FA и резервные коды; email — только через `maskEmail()`, IP — только в `debug`.
- Docs: yes — обязательный docs checkpoint в `/aif-implement` через `/aif-docs`.

## Roadmap Linkage
Milestone: "Безопасность аутентификации"
Rationale: План закрывает все четыре подпункта этапа: сброс пароля, подтверждение email, rate limit в БД, 2FA и список сессий.

## Рамки этапа

**Входит:**
- **Сброс пароля.** Ссылка «Забыли пароль?» на `/login` ведёт на `/forgot-password`. Там вводится email, и пользователь всегда видит один и тот же ответ «если аккаунт существует, мы отправили письмо». По ссылке из письма открывается `/reset-password?token=…`: новый пароль и подтверждение. После сброса все сессии завершаются, на почту приходит уведомление «пароль изменён». Пользователь, вошедший только через GitHub, сбросом может задать себе пароль: Better Auth создаёт credential-аккаунт, если его нет (`api/routes/password.mjs`).
- **Подтверждение email.**
  - После регистрации сессия не создаётся: страница `/verify-email` показывает «проверьте почту» с кнопкой «Отправить ещё раз».
  - Ссылка из письма подтверждает email, сразу выполняет вход (`autoSignInAfterVerification`) и ведёт на `returnTo`, например на приглашение.
  - Вход с неподтверждённым email отклоняется. Пользователь видит понятное сообщение и кнопку повторной отправки.
  - Регистрация на уже занятый email отвечает так же, как успешная (без перечисления аккаунтов). Владельцу адреса уходит письмо «кто-то пытался зарегистрироваться».
  - Принять приглашение можно только с подтверждённым email (`requireEmailVerificationOnInvitation`).
- **Rate limit.** Встроенный лимит Better Auth переводится на хранилище `database`: он закрывает прямые HTTP-вызовы `/api/auth/*`. Клиентский IP берётся из `X-Forwarded-For`. Для Server Actions, которые лимит Better Auth обходят, появляется свой лимитер в БД. Он ограничивает вход, регистрацию, запрос сброса пароля, повторную отправку письма, шаг 2FA и смену пароля — по IP и по паре «IP + email».
- **Двухфакторная аутентификация (TOTP).**
  - Включение в профиле: пароль → QR-код и секрет вручную → подтверждение кодом → показ 10 резервных кодов (копировать и скачать `.txt`).
  - Выключение и перевыпуск резервных кодов — по паролю.
  - При входе — шаг `/login/two-factor`: код из приложения или резервный код, флажок «Доверять этому устройству на 30 дней».
  - Администратор может сбросить 2FA пользователю, который потерял устройство и резервные коды.
- **Вкладка профиля «Безопасность»** (`/profile/security`): смена пароля (с завершением других сессий), 2FA, список активных сессий. В списке — устройство и браузер, IP, время входа и последней активности, пометка «Это устройство» и «Вход администратора» (impersonation). Сессию можно завершить по одной или все, кроме текущей.

**Не входит:**
- 2FA по email-OTP или SMS, passkeys/WebAuthn, CAPTCHA, проверка паролей по HaveIBeenPwned.
- 2FA при входе через GitHub: плагин `twoFactor` перехватывает только `/sign-in/email`, а вход через GitHub защищает сам GitHub. Задокументировать как ограничение.
- Смена email пользователем (`changeEmail`) и подтверждение нового адреса.
- Принудительная 2FA для администраторов или пространства (политика) — кандидат в следующий этап.
- Мгновенная потеря доступа завершённой сессией: cookie-кеш сессии остаётся (до 5 минут). Задокументировать в UI и в `docs/architecture.md`.
- Журнал входов (audit log) — только структурированные логи.

## Ключевые решения

- **Конфиг Better Auth** (`src/shared/auth/auth.ts`). `shared/` не зависит от модулей, поэтому шаблоны писем и колбэки лежат в `src/shared/auth/`.
  - `emailAndPassword`:
    - `requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION`, `autoSignIn: true` (при обязательном подтверждении Better Auth сам не создаёт сессию);
    - `sendResetPassword`, `resetPasswordTokenExpiresIn: 3600`, `revokeSessionsOnPasswordReset: true`;
    - `onPasswordReset` — письмо «пароль изменён»;
    - `onExistingUserSignUp` — письмо «попытка регистрации»;
    - `customSyntheticUser` — добавляет поля плагинов (`role`, `banned`, `banReason`, `banExpires`, `isAgent`, `twoFactorEnabled`), чтобы ответ на занятый email не отличался от настоящего.
  - `emailVerification`: `sendVerificationEmail`, `sendOnSignUp: true`, `sendOnSignIn: true`, `autoSignInAfterVerification: true`, `expiresIn: 86400`, `afterEmailVerification` — лог.
  - Плагин `organization`: `requireEmailVerificationOnInvitation: env.AUTH_REQUIRE_EMAIL_VERIFICATION`.
  - Плагин `twoFactor`: `issuer: 'Tasker'`, `skipVerificationOnEnable: false`, `backupCodeOptions: { amount: 10 }`, `trustDeviceMaxAge` по умолчанию (30 дней). Подключается перед `nextCookies()`: тот должен остаться последним.
  - `rateLimit`: `{ enabled: true, storage: 'database', customRules }` (см. таблицу ниже); `advanced.ipAddress.ipAddressHeaders: ['x-forwarded-for']`.
  - Письма уходят **в фоне** (`sendMailInBackground` в `@/shared/mail`: `after()` с фолбэком на промис без ожидания, как `notifyByEmail`). Так время ответа не выдаёт, существует ли аккаунт, а сбой SMTP не роняет запрос. Адреса `.invalid` (агенты) `sendMail` уже пропускает.
- **Новая переменная** `AUTH_REQUIRE_EMAIL_VERIFICATION` (`z.stringbool()`, по умолчанию `true`) в `src/shared/env/env.ts`, `.env.example`, `deploy/tasker/.env.example`. `false` нужен для локальных стендов без почты и будущих e2e.
- **Существующие пользователи** не должны оказаться заблокированы. Миграция данных: `UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false` — для всех, кто зарегистрировался до этапа. Пользователи GitHub получают флаг от провайдера. Агенты не входят в интерфейс, поэтому флаг на них не влияет, но миграция проставляет и им.
- **Почему отдельный лимитер для Server Actions.** Лимит Better Auth срабатывает только в HTTP-роутере (`onRequestRateLimit` в `api/index.mjs`), а вход и регистрация в Tasker идут через `auth.api.*` из Server Actions. Таблицу Better Auth `RateLimit` использовать нельзя: Better Auth чистит строки старше своего самого длинного окна (60 с). Счётчики с окном 15 минут и 1 час обнулялись бы раньше срока.
  - **Своя таблица `ActionRateLimit`** (`key` PK, `count`, `windowStart`, `expiresAt`, индекс по `expiresAt`) и `src/shared/rate-limit/`. `consumeRateLimit(key, rule)` — один атомарный `INSERT … ON CONFLICT (key) DO UPDATE … RETURNING` через `prisma.$queryRaw`: окно истекло — счётчик сбрасывается, иначе увеличивается. Превышение → `RateLimitError`. Устаревшие строки удаляются с вероятностью 1/50 на вызов (`DELETE … WHERE "expiresAt" < now()` в фоне).
  - Ключи: `<action>:ip:<ip>` и `<action>:ip-email:<ip>:<sha256(email)[0..16]>`. Email в открытом виде в БД не хранится. Лимитировать только по email без IP нельзя: злоумышленник заблокировал бы вход жертве.
  - IP: `getClientIp(headers)` — первый адрес из `X-Forwarded-For`, затем `X-Real-IP`, иначе `'unknown'` (один общий бакет и `warn` один раз за процесс). За edge-Caddy этому можно доверять: `reverse_proxy` без `trusted_proxies` перезаписывает `X-Forwarded-For` адресом клиента. Задокументировать: без доверенного прокси перед приложением заголовок подделывается.
- **Правила лимитов** (константы в `src/shared/rate-limit/rules.ts`):

  | Действие | По IP | По IP + email/пользователю |
  |---|---|---|
  | `sign-in` | 30 / 10 мин | 5 / 10 мин |
  | `sign-up` | 5 / 1 ч | — |
  | `password-reset-request` | 10 / 1 ч | 3 / 1 ч |
  | `password-reset` (ввод нового пароля) | 10 / 10 мин | — |
  | `verification-resend` | 10 / 1 ч | 3 / 1 ч |
  | `two-factor-verify` | 20 / 10 мин | — (до входа `userId` не известен); перебор кодов одного пользователя ограничивает встроенная блокировка плагина (`failedVerificationCount`/`lockedUntil`) |
  | `change-password` | — | 5 / 10 мин на `userId` |

  Better Auth `customRules` для HTTP-путей: `/sign-in/email` 5/60 с, `/sign-up/email` 3/60 с, `/request-password-reset` и `/send-verification-email` 3/300 с, `/two-factor/*` 5/60 с; общий лимит по умолчанию (100/10 с) не меняется.
- **Ошибки.**
  - В `src/shared/errors` — новый код `RATE_LIMITED` (HTTP 429) и класс `RateLimitError` с `retryAfterSeconds` в `details` и сообщением «Слишком много попыток. Повторите через N мин.» Проверить, что `toActionError`/`toErrorResponse` его пропускают; `toErrorResponse` ставит `Retry-After`.
  - `mapAuthError` (`credentials.errors.ts`) дополняется: `EMAIL_NOT_VERIFIED` → `ForbiddenError` с кодом-подсказкой для UI (`details.reason = 'email-not-verified'`); `INVALID_TOKEN` → `ValidationError('Ссылка недействительна или устарела')`; `INVALID_CODE` / `INVALID_TWO_FACTOR_COOKIE` / `INVALID_BACKUP_CODE` / `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` → понятные сообщения; `INVALID_PASSWORD` → `ValidationError` по полю `currentPassword`; `APIError` со статусом 429 → `RateLimitError`. Точные коды сверить с `TWO_FACTOR_ERROR_CODES` и `BASE_ERROR_CODES` в `node_modules/better-auth`.
- **Вход с 2FA.** `signInEmail` для пользователя с 2FA возвращает `{ twoFactorRedirect: true }` и ставит подписанную cookie шага 2FA (`nextCookies` проставит её из Server Action). Сервис `signIn` возвращает `{ kind: 'signed-in' } | { kind: 'two-factor' }`, action ведёт на `/login/two-factor?returnTo=…`. Там `verifyTOTP` / `verifyBackupCode` (`auth.api.*` с заголовками запроса) создают сессию, и пользователь уходит на `returnTo`. Страница без cookie шага 2FA сразу отправляет на `/login`.
- **Сессии в профиле.** *(Уточнено при реализации.)* `auth.api.listSessions` требует «свежую» сессию (моложе суток, `freshSessionMiddleware`) и отдаёт токены, поэтому список и завершение — своим репозиторием `session.repository.ts` (Prisma: `Session` по `userId`, `expiresAt > now`; удаление `deleteMany({ id, userId })` — то же, что делает `revokeSession` без вторичного хранилища). DTO без токена: `{ id, current, deviceLabel, ipAddress, impersonated, createdAt, updatedAt }`. Завершить можно только свою сессию и не текущую. Подпись устройства строит чистая функция `describeUserAgent(ua)` (`Chrome · Windows`, `Safari · iPhone`, иначе «Неизвестное устройство»), без новой зависимости.
- **QR-код** рисуется на клиенте пакетом `qrcode` (+ `@types/qrcode`) в SVG (`QRCode.toString(uri, { type: 'svg' })`). `totpURI` возвращает Server Action и в лог не попадает. Рядом — секрет для ручного ввода (параметр `secret` из URI) и кнопка копирования.
- **Модуль `auth`** — новые срезы по образцу `credentials/`:
  - `slices/password/` — `password.schema.ts` (`forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema`), `password.service.ts`, `password.actions.ts`;
  - `slices/verification/` — повторная отправка письма;
  - `slices/two-factor/` — шаг входа и управление;
  - `slices/session/` — список и завершение сессий;
  - `models/` — чистые функции (`describeUserAgent`, разбор `otpauth://`, правила UI).
  - Публичное API — `index.ts` (сервер) и `client.ts` (actions, схемы, типы). Если `client.ts` у модуля ещё нет, создать по образцу `workspaces/client.ts`.
- **Админка.** В модуль `admin` — `resetUserTwoFactor` (удаление строки `TwoFactor` и `User.twoFactorEnabled = false` в одной транзакции, затем `revokeUserSessions` плагина). В таблице — бейджи «Email не подтверждён» и «2FA». Действие доступно только для `requireAdmin()` на свежей сессии и не над собой.
- **Публичные пути** в `src/proxy.ts`: `/forgot-password`, `/reset-password`, `/verify-email` (`/login/two-factor` уже покрыт префиксом `/login/`).
- **Перед реализацией** сверить с `node_modules/next/dist/docs` API `after()`, `redirect()` в Server Actions и `PageProps`/`searchParams`, а с типами `better-auth@1.7.6` — сигнатуры `requestPasswordReset`, `resetPassword`, `sendVerificationEmail`, `changePassword`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `enableTwoFactor`, `verifyTOTP`, `verifyBackupCode`, `disableTwoFactor`, `generateBackupCodes`.

## Commit Plan
- **Commit 1** (после задач 1–4): `feat(auth): database rate limit, email verification and password reset config`
- **Commit 2** (после задач 5–8): `feat(auth): password reset, email verification and two-factor flows`
- **Commit 3** (после задач 9–11): `feat(auth): security tab, sign-in pages and admin 2FA reset`
- **Commit 4** (после задачи 12): `docs(auth): authentication security`

## Tasks

### Phase 1: Инфраструктура

- [x] Task 1: Схема БД и миграция
  - `prisma/schema.prisma`:
    - модель `RateLimit` для Better Auth (`id String @id`, `key String @unique`, `count Int`, `lastRequest BigInt`);
    - своя `ActionRateLimit` (`key String @id`, `count Int`, `windowStart DateTime`, `expiresAt DateTime`, `@@index([expiresAt])`);
    - `TwoFactor` (`id`, `secret`, `backupCodes`, `userId` с FK `onDelete: Cascade` и индексом, `verified Boolean @default(true)`, `failedVerificationCount Int @default(0)`, `lockedUntil DateTime?`, индекс по `secret`);
    - `User.twoFactorEnabled Boolean @default(false)` и связь `twoFactors TwoFactor[]`.
    - Поля сверить с `better-auth/dist/plugins/two-factor/schema.mjs` и `@better-auth/core` (модель `rateLimit`). Комментарии `///` — в стиле файла.
  - Миграция `pnpm db:migrate --name auth_security`, в конце — ручной SQL: `UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;` с комментарием о причине (пользователи до этапа).
  - Проверка: `pnpm prisma validate`, миграция применяется на чистом Postgres (как в CI).
  - Логи: не требуются (схема).

- [x] Task 2: Лимитер Server Actions и ошибка `RATE_LIMITED`
  - `src/shared/errors/app-error.ts`: код `RATE_LIMITED` в `ERROR_CODES`, класс `RateLimitError(retryAfterSeconds)` (HTTP 429, `expose: true`, сообщение с округлением до минут или секунд). Экспорт из `index.ts`. `toErrorResponse` ставит заголовок `Retry-After`. `normalize-error.ts` логирует `warn` с кодом.
  - `src/shared/rate-limit/`:
    - `rules.ts` — константы из таблицы «Правила лимитов»;
    - `keys.ts` — чистые `rateLimitKey(action, parts)` и `hashIdentifier(email)` (`sha256`, нижний регистр, первые 16 hex);
    - `client-ip.ts` — `getClientIp(headers: Headers)`;
    - `rate-limit.ts` — `consumeRateLimit(key, rule)` (атомарный upsert через `$queryRaw`, вероятностная очистка) и `enforceRateLimits(checks[])` — проверяет все ключи и бросает `RateLimitError` с наибольшим `retryAfter`;
    - `index.ts`.
  - Правило границ: `shared/rate-limit` зависит только от `shared/db`, `shared/errors`, `shared/logger`. Проверить `eslint.config.mjs`.
  - Тесты:
    - `keys.test.ts` — стабильность и нормализация хеша, отсутствие email в ключе;
    - `client-ip.test.ts` — цепочка `X-Forwarded-For`, пробелы, IPv6, `X-Real-IP`, отсутствие заголовков;
    - `rate-limit.test.ts` — мок `prisma.$queryRaw`: разрешено, превышение → `RateLimitError` с `retryAfter`, выбор наибольшего `retryAfter`;
    - `app-error.test.ts`/`to-http-response.test.ts` — 429 и `Retry-After`.
  - Логи (`createLogger('rate-limit')`): `debug` `[rateLimit.consume]` (`action`, `count`, `max`; ключ — без IP и email); `warn` `[rateLimit.exceeded]` (`action`, `retryAfterSeconds`); `warn` один раз `[rateLimit.ip] client IP unknown`; `error` при сбое БД (fail-open: лимит не должен ронять вход, сбой логируется).

- [x] Task 3: Письма аутентификации и фоновая отправка
  - `src/shared/mail/`: `sendMailInBackground(message, context)` — `after()` с фолбэком на промис с `.catch` (как в `notification.service.ts`), никогда не бросает. Экспорт из `index.ts`. Если подходящий хелпер уже есть в `notifications`, перенести общую часть сюда и переиспользовать.
  - `src/shared/auth/auth-emails.ts` — шаблоны (`text` + `html` через `escapeHtml`, стиль — как у писем приглашений и уведомлений):
    - `buildPasswordResetEmail({ name, url })` (срок 1 час);
    - `buildVerificationEmail({ name, url })` (срок 24 часа);
    - `buildPasswordChangedEmail({ name })` («если это были не вы — сбросьте пароль», ссылка на `/forgot-password`);
    - `buildSignUpAttemptEmail({ name })` («кто-то пытался зарегистрироваться на ваш адрес; если это вы — войдите или восстановите пароль»).
  - Тесты `auth-emails.test.ts`: экранирование имени, ссылка присутствует в `text` и `html`, нет лишних данных.
  - Логи: `info` `[mail.background] queued` (`template`, `to: maskEmail`); `error` при сбое отправки (`template`, `err`); ссылку и токен не логировать.

- [x] Task 4: Конфигурация Better Auth (depends on 1, 2, 3)
  - `src/shared/env/env.ts` + `env.test.ts`: `AUTH_REQUIRE_EMAIL_VERIFICATION` (по умолчанию `true`, `'false'` → `false`). `.env.example`, `deploy/tasker/.env.example`.
  - `src/shared/auth/auth.ts`: всё из «Ключевых решений» → «Конфиг Better Auth»:
    - `emailAndPassword` (сброс, колбэки, `customSyntheticUser`) и `emailVerification`;
    - `requireEmailVerificationOnInvitation` в `workspacesPlugin()`;
    - `twoFactor(...)` перед `nextCookies()`;
    - `rateLimit` с `storage: 'database'` и `customRules`;
    - `advanced.ipAddress.ipAddressHeaders`;
    - `user.additionalFields` не трогать: `twoFactorEnabled` добавляет плагин.
    - Ссылка в письме подтверждения: Better Auth строит её с `callbackURL` из `signUpEmail`/`sendVerificationEmail`. Сброс пароля: `redirectTo: '/reset-password'`.
  - Обновить комментарий у `accountLinking.disableImplicitLinking`: email теперь подтверждается, но неявную привязку оставляем выключенной (решение не меняется). Удалить устаревший комментарий про rate limit.
  - Лог инициализации `[auth] better-auth initialized`: добавить `plugins: [..., 'two-factor']`, `rateLimitStorage: 'database'`, `emailVerificationRequired`.
  - Тесты: вынести сборку `customRules` и `customSyntheticUser` в чистые функции (`src/shared/auth/auth-options.ts`) и покрыть `auth-options.test.ts` — синтетический пользователь содержит все поля плагинов с безопасными значениями, правила покрывают нужные пути.
  - Логи: `info` в колбэках `[auth.passwordReset] requested` / `[auth.passwordReset] completed` (`userId`), `[auth.emailVerification] sent` / `verified` (`userId`), `[auth.signUp] existing email attempt` (`userId`); ссылки, токены и email в открытом виде — нет.

<!-- Commit checkpoint: tasks 1-4 -->

### Phase 2: Сценарии модуля `auth`

- [x] Task 5: Вход и регистрация — лимиты, подтверждение email, шаг 2FA (depends on 4)
  - `slices/credentials/credentials.service.ts`:
    - `signIn` — `enforceRateLimits` (`sign-in` по IP и IP+email) перед `signInEmail`; передаёт `callbackURL` (безопасный `returnTo`) для письма при `sendOnSignIn`; возвращает `{ kind: 'signed-in' } | { kind: 'two-factor' }` по `twoFactorRedirect`.
    - `signUp` — лимит `sign-up` по IP, `callbackURL` = безопасный `returnTo`; возвращает `{ kind: 'signed-in' } | { kind: 'verification-sent' }` (сессии нет при обязательном подтверждении — определить по наличию `token` в ответе).
  - `credentials.actions.ts`:
    - `signInAction` — при `two-factor` → `redirect('/login/two-factor?returnTo=…')`;
    - `signUpAction` — при `verification-sent` → `redirect('/verify-email?sent=1&returnTo=…')`;
    - ошибка `email-not-verified` возвращается в `AuthFormState` с флагом `needsVerification`: форма покажет кнопку повторной отправки.
  - `credentials.errors.ts`: новые коды из «Ключевых решений» → «Ошибки» + 429.
  - `slices/verification/`:
    - `verification.schema.ts` — `resendVerificationSchema` (`email`, `returnTo`);
    - `verification.service.ts` — `resendVerificationEmail`: лимиты `verification-resend`, `auth.api.sendVerificationEmail`, ответ всегда одинаковый, ошибки «пользователь не найден / уже подтверждён» проглатываются с `debug`;
    - `verification.actions.ts` — `resendVerificationAction` (`FormState`).
  - Тесты:
    - `credentials.service.test.ts` — лимит вызывается до Better Auth; `twoFactorRedirect` → `two-factor`; регистрация без токена → `verification-sent`;
    - `credentials.errors.test.ts` — новые коды;
    - `verification.service.test.ts` — одинаковый ответ для существующего и несуществующего email.
  - Логи (`auth.credentials`, `auth.verification`): `debug` старт (`email: maskEmail`), `info` `[credentials.signIn] two-factor required` (`userId` нет — только факт), `[credentials.signUp] verification sent`, `[verification.resend] requested`; `warn` отказ с кодом.

- [x] Task 6: Сброс и смена пароля (depends on 4)
  - `slices/password/`:
    - `password.schema.ts` — `forgotPasswordSchema` (`email`); `resetPasswordSchema` (`token` непустой ≤ 256, `password` и `confirmPassword` с общими константами длины из `credentials.schema.ts`, `refine` на совпадение); `changePasswordSchema` (`currentPassword`, `newPassword`, `confirmPassword`, `newPassword !== currentPassword`).
    - `password.service.ts`:
      - `requestPasswordReset` — лимиты, `auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } })`, всегда успех, ошибки Better Auth кроме сбоев глотаются;
      - `resetPassword` — лимит, `auth.api.resetPassword({ body: { newPassword, token } })`;
      - `changePassword` — `requireUser()`, лимит по `userId`, `auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers })`, затем письмо «пароль изменён» через `sendMailInBackground`.
    - `password.actions.ts` — `forgotPasswordAction` (успех → состояние «письмо отправлено»), `resetPasswordAction` (успех → `redirect('/login?reset=1')`), `changePasswordAction` (`FormState`, `revalidatePath('/profile/security')`).
  - Тесты: `password.schema.test.ts` (несовпадение, длина, тот же пароль); `password.service.test.ts` (одинаковый ответ, лимит, маппинг `INVALID_TOKEN` и `INVALID_PASSWORD`).
  - Логи (`auth.password`): `debug` старт; `info` `[password.reset] completed`, `[password.change] completed` (`userId`); `warn` неверный токен или текущий пароль, лимит.

- [x] Task 7: Двухфакторная аутентификация (depends on 4, 5)
  - `models/two-factor.ts` (чистый TS): `parseTotpUri(uri)` → `{ secret, issuer, account }` (для ручного ввода); `formatBackupCodesFile(codes, email, date)` → текст `.txt`; `normalizeTotpCode(input)` (убрать пробелы и дефисы, 6 цифр).
  - `slices/two-factor/`:
    - `two-factor.schema.ts` — `verifyTotpSchema` (`code` 6 цифр, `trustDevice` checkbox, `returnTo`), `verifyBackupCodeSchema`, `passwordConfirmSchema`, `confirmEnableSchema`.
    - `two-factor.service.ts`:
      - шаг входа — `verifySignInTotp` / `verifySignInBackupCode`: лимит `two-factor-verify`, `auth.api.verifyTOTP` / `verifyBackupCode` с заголовками;
      - управление (`requireUser()`): `startEnableTwoFactor(password)` → `{ totpURI, backupCodes }`; `confirmEnableTwoFactor(code)` — `verifyTOTP` с сессией включает 2FA; `disableTwoFactor(password)`; `regenerateBackupCodes(password)` → `backupCodes`; `getMyTwoFactorState()` → `{ enabled, hasPassword }` (`hasPassword` — есть ли credential-аккаунт, через свой репозиторий `two-factor.repository.ts`, только `select` нужных полей).
    - `two-factor.actions.ts` — actions для каждого шага. Шаг входа после успеха → `redirect(returnTo)`. Секрет и коды возвращаются только в результате action и нигде не кешируются.
  - Тесты: `two-factor.test.ts` (модель); `two-factor.service.test.ts` — лимит до Better Auth, `hasPassword: false` → `ValidationError` при попытке включить, маппинг `INVALID_CODE`.
  - Логи (`auth.two-factor`): `info` `[twoFactor.enable] started` / `confirmed`, `[twoFactor.disable]`, `[twoFactor.backupCodes] regenerated`, `[twoFactor.signIn] verified` (`method: totp|backup`, `trustDevice`); `warn` неверный код или блокировка; секреты, URI и коды — никогда.

- [x] Task 8: Активные сессии (depends on 4)
  - `models/user-agent.ts`: `describeUserAgent(ua: string | null)` → `{ browser, os, label }` — Edge, Chrome, Firefox, Safari, Opera, Яндекс Браузер; Windows, macOS, iOS, Android, Linux.
  - `slices/session/`:
    - `session.dto.ts` — `MySessionDto` (см. «Ключевые решения»; даты — ISO и отформатированные на сервере `Intl.DateTimeFormat('ru')`);
    - `session.service.ts` — `listMySessions()` (`requireUser()`, `auth.api.listSessions`, сортировка: текущая первой, затем по `updatedAt`); `revokeMySession(id)` (поиск среди своих → `revokeSession({ token })`, текущую завершать нельзя — для неё есть «Выйти»); `revokeMyOtherSessions()`;
    - `session.actions.ts` — `revokeSessionAction`, `revokeOtherSessionsAction` (`revalidatePath('/profile/security')`).
  - Тесты: `user-agent.test.ts` (реальные строки UA, `null`); `session.service.test.ts` — чужой или неизвестный `id` → `NotFoundError`, текущая → `ValidationError`, токен в DTO отсутствует.
  - Логи (`auth.session`): `debug` `[session.list]` (`count`); `info` `[session.revoke]` (`userId`, `sessionId`), `[session.revokeOthers]` (`userId`, `count`); `warn` на чужой `id`.

<!-- Commit checkpoint: tasks 5-8 -->

### Phase 3: Интерфейс

- [x] Task 9: Публичные страницы входа (depends on 5, 6, 7)
  - `src/proxy.ts`: `PUBLIC_PATHS` += `/forgot-password`, `/reset-password`, `/verify-email`.
  - `src/app/(auth)/forgot-password/page.tsx` + `src/components/auth/forgot-password-form.tsx` — после отправки форма сменяется текстом «Если аккаунт существует, мы отправили письмо…» с подсказкой проверить «Спам».
  - `src/app/(auth)/reset-password/page.tsx` + `reset-password-form.tsx`: `?token` — форма нового пароля; `?error=INVALID_TOKEN` или нет токена — «Ссылка недействительна или устарела» и ссылка на `/forgot-password`.
  - `src/app/(auth)/verify-email/page.tsx`: `?sent=1` — «Проверьте почту» + форма повторной отправки (email); `?error=…` — ошибка ссылки + повторная отправка. Ссылка из письма после успеха ведёт сразу на `returnTo` (автовход), отдельного состояния «успех» не нужно.
  - `src/app/(auth)/login/two-factor/page.tsx` + `two-factor-sign-in-form.tsx`: поле кода (`inputMode="numeric"`, `autoComplete="one-time-code"`), переключатель «Использовать резервный код», флажок «Доверять этому устройству».
  - `sign-in-form.tsx`: ссылка «Забыли пароль?» рядом с полем пароля; баннер `?reset=1` («Пароль изменён, войдите»); при `needsVerification` — кнопка «Отправить письмо ещё раз».
  - `sign-up-form.tsx`: подсказка, что придёт письмо для подтверждения.
  - Все страницы — по образцу `/login` (`(auth)/layout.tsx`, `Suspense`, `FormField`, `FormError`, `useActionState`), `metadata.title` вида «Сброс пароля — Tasker». Вошедший пользователь на этих страницах (кроме `/verify-email`) уходит на `/`, как на `/login`.
  - Проверка: сценарии сквозь Mailpit — регистрация → письмо → автовход; сброс пароля → вход; вход с 2FA; скриншоты на 375 px.
  - Логи: страницы не логируют. Ошибки идут через actions.

- [x] Task 10: Вкладка профиля «Безопасность» (depends on 6, 7, 8)
  - `src/components/profile/profile-nav.tsx`: вкладка «Безопасность» (`/profile/security`) после «Аккаунт».
  - `src/app/(app)/profile/security/page.tsx` — Server Component в `Suspense`, `requireUserOrRedirect('/profile/security')`, три секции в стиле `SettingsSection`:
    - `src/components/profile/security/change-password-form.tsx` — текущий, новый и повтор пароля. Без пароля (`hasPassword: false`) — текст «Вы входите через GitHub. Задать пароль можно через „Забыли пароль?“» со ссылкой.
    - `two-factor-section.tsx` — состояние (включена или выключена) и мастер включения в `Dialog`: пароль → QR (`qrcode`, SVG) + секрет с копированием → код → резервные коды (копировать, скачать `.txt` через `formatBackupCodesFile`, флажок «Я сохранил коды» перед закрытием). Выключение и перевыпуск кодов — через `ConfirmActionDialog` с полем пароля. Без пароля 2FA недоступна (подсказка).
    - `active-sessions.tsx` — список сессий: подпись устройства, IP, «Вход: …», «Активность: …», бейджи «Это устройство» и «Вход администратора»; кнопки «Завершить» и «Завершить все остальные» с подтверждением. Под списком — подсказка, что завершённая сессия может оставаться активной до 5 минут.
  - `pnpm add qrcode` и `pnpm add -D @types/qrcode` (точные версии, как остальные зависимости в `package.json`).
  - Проверка: скриншоты 1440 и 375 px, тёмная тема, клавиатурная навигация в мастере.
  - Логи: клиентские компоненты не логируют (`console.*` запрещён). Серверные события логируют actions из задач 6–8.

- [x] Task 11: Админка — 2FA и подтверждение email (depends on 1, 7)
  - `src/modules/admin/slices/user/`:
    - `user.repository.ts` — в `select` списка `emailVerified`, `twoFactorEnabled`; `resetTwoFactor(userId)` — транзакция `twoFactor.deleteMany` + `user.update({ twoFactorEnabled: false })`;
    - `user.service.ts` — `resetUserTwoFactor({ userId })`: `requireAdmin()` → `findById` → `assertCanManageUser` → репозиторий → `revokeUserSessions` через `callAdminApi`;
    - `user.schema.ts`, `user.actions.ts` (`resetUserTwoFactorAction`), `user.dto.ts` (`emailVerified`, `twoFactorEnabled`).
  - `src/components/admin/users/admin-users-table.tsx` — бейджи «Email не подтверждён» и «2FA»; `user-actions-menu.tsx` — пункт «Сбросить 2FA» (только при включённой 2FA) с `ConfirmActionDialog`.
  - Тесты: `user.service.test.ts` — не-админ → `ForbiddenError`, самодействие → отказ, сессии завершаются после сброса.
  - Логи: `info` `[admin.user.resetTwoFactor]` (`actorId`, `userId`); `warn` на отказах.

<!-- Commit checkpoint: tasks 9-11 -->

### Phase 4: Документация и дорожная карта

- [x] Task 12: Документация (depends on 1–11)
  - `docs/architecture.md`:
    - раздел «Безопасность аутентификации»: сценарии, лимиты (обе системы и почему их две), доверие к `X-Forwarded-For`, 2FA и её границы (GitHub), сессии и окно cookie-кеша;
    - обновить «Известные ограничения» — убрать пункты про отсутствие rate limit и подтверждения email;
    - модели `RateLimit`, `ActionRateLimit`, `TwoFactor`.
  - `docs/configuration.md`: `AUTH_REQUIRE_EMAIL_VERIFICATION`; почта обязательна для регистрации; заголовок клиентского IP.
  - `docs/production.md`: SMTP должен быть настроен до включения; проверка писем; миграция помечает существующих пользователей подтверждёнными.
  - `docs/getting-started.md`: первый вход — письмо в Mailpit (http://localhost:8025).
  - `AGENTS.md`: `src/shared/rate-limit/`, новые срезы `auth`, страницы `(auth)` и `/profile/security`, модели в описании `schema.prisma`.
  - `.ai-factory/ROADMAP.md`: отметить подпункты и этап «Безопасность аутентификации» выполненными, строка в «Завершено» с датой.
  - Логи: не требуются.

<!-- Commit checkpoint: task 12 -->
