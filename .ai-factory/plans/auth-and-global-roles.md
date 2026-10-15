# План реализации: Аутентификация и глобальные роли

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-15

## Settings
- Testing: yes (Vitest)
- Logging: verbose
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Аутентификация и глобальные роли"
Rationale: План полностью покрывает этап: Better Auth, регистрация и вход, роль администратора ресурса.

## Рамки этапа

**Входит:**
- Better Auth с Prisma-адаптером: email + пароль, сессии в БД (cookie).
- Плагин `admin`: глобальная роль пользователя `user` / `admin` (в терминах DESCRIPTION — `USER` / `ADMIN`).
- Назначение первого администратора через переменную окружения `ADMIN_EMAILS`.
- Страницы входа и регистрации, выход, защищённая зона `(app)`, заглушка `/admin`, доступная только администратору.
- Сквозной слой: `src/shared/auth` (конфиг, `getSession()`) и `src/shared/access` (`requireUser()`, `requireAdmin()`).

**Не входит (следующие этапы):**
- GitHub OAuth — вместе с этапом «Интеграция с GitHub».
- Плагин `organization`, пространства, приглашения, `requireWorkspaceAccess()` — этап «Рабочие пространства и доступы».
- Подтверждение email и сброс пароля (нужен почтовый транспорт), панель управления пользователями — этап «Администрирование ресурса».

## Ключевые решения

- **Вход и регистрация — через Server Actions** модуля `auth` (`auth.api.signInEmail` / `signUpEmail` + плагин `nextCookies`). Так сохраняется схема `app → actions → service`, единый `ActionResult` и Zod-схемы, общие для формы и сервера. Отдельный `better-auth/react` клиент на этом этапе не нужен.
- **Ленивая инициализация.** Экземпляр Better Auth создаётся через `getAuth()` при первом обращении (как `prisma` и `env`), чтобы `next build` не падал без `.env`.
- **Proxy — только оптимистичная проверка** наличия session-cookie (`getSessionCookie` из `better-auth/cookies`). Настоящая проверка сессии и роли — на сервере в `requireUser()` / `requireAdmin()`, это требование `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **Cache Components.** Чтение сессии (`headers()`) — динамическое API. Перед реализацией UI прочитать `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md` и раздел про shell UI в `authentication.md` (не держать `{children}` за top-level `await` сессии в layout; session-зависимые части — в `<Suspense>`).
- **Модель ролей** — чистая функция в `src/shared/access/global-role.ts` (без Prisma и Next.js): `shared/` не должен зависеть от модулей, а проверка глобальной роли нужна всем модулям.
- **Rate limiting.** Встроенный rate limit Better Auth работает только для HTTP-эндпоинтов `/api/auth/*`; вызовы `auth.api.*` из Server Actions его обходят. На этом этапе это фиксируется как известное ограничение (в комментарии и в docs); полноценный лимит — в этапе «Готовность к продакшену».

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(auth): add better-auth config, auth schema and env`
- **Commit 2** (после задач 4–6): `feat(auth): add access guards and sign-in/sign-up actions`
- **Commit 3** (после задач 7–9): `feat(auth): add login/register pages, protected app shell and admin stub`

## Tasks

### Phase 1: Инфраструктура аутентификации

- [x] Task 1: Зависимость `better-auth` и переменные окружения
  - `pnpm add better-auth@1.7.6` (установлено; 1.7.9 — свежий релиз, выбран проверенный 1.7.6) — точная версия (без `^`), как остальные зависимости. Проверить совместимость с Prisma 7 / `prisma-client` генератором и Next 16 по changelog.
  - `src/shared/env/env.ts`: добавить
    - `BETTER_AUTH_SECRET`: `z.string().min(32)`;
    - `BETTER_AUTH_URL`: `z.url()` (локально `http://localhost:3000`);
    - `ADMIN_EMAILS`: строка через запятую → `transform` в массив email в нижнем регистре, пустой по умолчанию.
  - `.env.example`: секция `# --- Аутентификация (Better Auth) ---` с комментарием, как сгенерировать секрет (`openssl rand -base64 32`), пример `ADMIN_EMAILS=admin@example.com`.
  - `src/shared/logger/logger.ts`: проверить, что `redact` покрывает `password`, `*.password`, `token`, `headers.cookie`; добавить `*.newPassword`, `*.sessionToken`, если их нет.
  - Тесты (`src/shared/env/env.test.ts`): короткий секрет → ошибка с ключом `BETTER_AUTH_SECRET` без значения; `ADMIN_EMAILS=" A@x.io, b@y.io ,"` → `['a@x.io', 'b@y.io']`; без `ADMIN_EMAILS` → `[]`.
  - Логирование: изменений в env нет (env не логирует). Ошибка валидации по-прежнему содержит только имена ключей.
  - Files: `package.json`, `pnpm-lock.yaml`, `src/shared/env/env.ts`, `src/shared/env/env.test.ts`, `.env.example`, `src/shared/logger/logger.ts`.

- [x] Task 2: Prisma-схема для Better Auth и миграция (depends on 1)
  - `prisma/schema.prisma`: модели по базовой схеме Better Auth + поля плагина `admin` (сверить с `npx @better-auth/cli generate --output <scratch>` или документацией, но генерировать в отдельный файл и переносить вручную — CLI не знает про наши соглашения):
    - `User`: `id`, `name`, `email @unique`, `emailVerified Boolean @default(false)`, `image?`, `createdAt`, `updatedAt`; admin-поля `role String @default("user")`, `banned Boolean? @default(false)`, `banReason?`, `banExpires DateTime?`; связи `sessions`, `accounts`;
    - `Session`: `id`, `token @unique`, `expiresAt`, `ipAddress?`, `userAgent?`, `userId` (FK, `onDelete: Cascade`), `impersonatedBy?`, `createdAt`, `updatedAt`; `@@index([userId])`;
    - `Account`: `id`, `accountId`, `providerId`, `userId` (FK, Cascade), `password?`, токены провайдеров, `createdAt`, `updatedAt`; `@@index([userId])`;
    - `Verification`: `id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`; `@@index([identifier])`.
  - Имена моделей — в PascalCase по соглашению проекта (`User`, `Session`, `Account`, `Verification`). Адаптер Better Auth обращается к `prisma.user`, `prisma.session` и т.д., поэтому `@@map` и `modelName` не нужны.
  - Убрать из шапки схемы фразу о том, что моделей пока нет.
  - `pnpm db:migrate --name add_auth` → `prisma/migrations/<ts>_add_auth/`.
  - Логирование: не требуется (схема). Проверка: `pnpm db:generate` без ошибок, таблицы созданы.
  - Files: `prisma/schema.prisma`, `prisma/migrations/*_add_auth/migration.sql`.

- [x] Task 3: Конфигурация Better Auth в `src/shared/auth` (depends on 1, 2)
  - `src/shared/auth/auth.ts` (`import 'server-only'`): `getAuth()` с ленивым singleton через `globalThis` (как `prisma`):
    - `database: prismaAdapter(prisma, { provider: 'postgresql' })`;
    - `secret` / `baseURL` из `getEnv()`;
    - `emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true }`;
    - `session`: срок жизни 7 дней, `updateAge` 1 день, `cookieCache` на 5 минут;
    - `plugins: [admin({ defaultRole: 'user', adminRoles: ['admin'] }), nextCookies()]` (`nextCookies` — последним);
    - `databaseHooks.user.create.before`: если email (в нижнем регистре) входит в `env.ADMIN_EMAILS` → `role: 'admin'`;
    - `advanced.useSecureCookies` в production; `rateLimit` включён для HTTP-эндпоинтов;
    - `logger`: адаптер Better Auth → `createLogger('auth')` (уровни `debug|info|warn|error` пробрасываются как есть).
  - `src/shared/auth/session.ts`: `getSession()` — `cache()` из React вокруг `getAuth().api.getSession({ headers: await headers() })`; возвращает DTO `AuthSession = { user: { id, email, name, image, role: GlobalRole }, session: { id, expiresAt } } | null` (не отдавать сырые объекты Better Auth наружу).
  - `src/shared/auth/index.ts`: экспорт `getAuth`, `getSession`, типы `AuthSession`, `AuthUser`.
  - `src/app/api/auth/[...all]/route.ts`: `GET`/`POST` через `toNextJsHandler`, обёрнутые так, чтобы `getAuth()` вызывался на запросе, а не при импорте.
  - Логирование (`createLogger('auth')`):
    - `INFO [auth] better-auth initialized { plugins, sessionTtl }` один раз;
    - `INFO [auth.hooks] user promoted to admin via ADMIN_EMAILS { userId }` (email не логировать целиком — только `userId` или маскированный email);
    - `DEBUG [auth.getSession] { hasSession, userId? }`;
    - `ERROR` при сбое `getSession` с `err` (без cookie и токенов), затем re-throw как `InternalError`.
  - Files: `src/shared/auth/auth.ts`, `src/shared/auth/session.ts`, `src/shared/auth/index.ts`, `src/app/api/auth/[...all]/route.ts`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: Авторизация и серверные действия

- [x] Task 4: Глобальные роли и guard-функции в `src/shared/access` (depends on 3)
  - `src/shared/access/global-role.ts` (чистый TS): `GLOBAL_ROLES = ['user', 'admin'] as const`, тип `GlobalRole`, `parseGlobalRole(value: string | null | undefined): GlobalRole` (неизвестное → `'user'`, безопасный дефолт), `isAdmin(user)`.
  - `src/shared/access/guards.ts` (`import 'server-only'`):
    - `requireUser(): Promise<AuthSession>` — нет сессии → `UnauthorizedError`; пользователь забанен → `ForbiddenError`;
    - `requireAdmin(): Promise<AuthSession>` — `requireUser()` + `isAdmin` иначе `ForbiddenError`;
    - для страниц: `requireUserOrRedirect(returnTo?)` → `redirect('/login?returnTo=...')` (только относительные пути, защита от open redirect), `requireAdminOrNotFound()` → `notFound()` (не раскрываем существование админки).
  - `src/shared/access/index.ts`: публичный API. Заготовить место (комментарий) под `requireWorkspaceAccess()` следующего этапа.
  - Тесты: `global-role.test.ts` (парсинг, неизвестная роль → `user`); `guards.test.ts` с `vi.mock('@/shared/auth')`: нет сессии → `UNAUTHORIZED`, `user` → `requireAdmin` даёт `FORBIDDEN`, `admin` → проходит, `banned` → `FORBIDDEN`; `returnTo` с абсолютным URL отбрасывается.
  - Логирование (`createLogger('access')`): `DEBUG [access.requireUser] { userId }`; `WARN [access.requireAdmin] forbidden { userId, role }`; `WARN [access.requireUser] unauthenticated`.
  - Files: `src/shared/access/global-role.ts`, `src/shared/access/guards.ts`, `src/shared/access/index.ts`, `src/shared/access/*.test.ts`.

- [x] Task 5: Модуль `auth`: Zod-схемы и сервис (depends on 3)
  - `src/modules/auth/slices/credentials/credentials.schema.ts`: `signInSchema` (`email` — trim + lowercase + `z.email()`, `password` — 1..128) и `signUpSchema` (`name` 1..100 trim, `email`, `password` 8..128, `confirmPassword` + `refine` на совпадение → ошибка поля `confirmPassword`). Схемы экспортируются для клиентских форм.
  - `src/modules/auth/slices/credentials/credentials.service.ts`: `signUp(input)`, `signIn(input)`, `signOut()` поверх `getAuth().api.*` с `headers: await headers()`.
  - Маппинг ошибок Better Auth (`APIError`) в доменные:
    - пользователь уже существует → `ConflictError('Пользователь с таким email уже зарегистрирован')`;
    - неверный email/пароль → `UnauthorizedError('Неверный email или пароль')` (одинаковое сообщение для обоих случаев — не раскрываем существование аккаунта);
    - забанен → `ForbiddenError`;
    - слабый/длинный пароль → `ValidationError` с `fieldErrors.password`;
    - прочее → re-throw (станет `INTERNAL_ERROR` в `toActionError`).
  - Тесты: схемы (нормализация email, несовпадение паролей, границы длины); маппинг ошибок — `mapAuthError` выделить в отдельную чистую функцию `credentials.errors.ts` и покрыть таблицей кейсов.
  - Логирование (`createLogger('auth.credentials')`): `DEBUG` на входе (без пароля, email маскирован), `INFO [credentials.signUp] user registered { userId }`, `INFO [credentials.signIn] signed in { userId }`, `WARN [credentials.signIn] invalid credentials` (без email в открытом виде), `INFO [credentials.signOut]`.
  - Files: `src/modules/auth/slices/credentials/credentials.schema.ts`, `credentials.service.ts`, `credentials.errors.ts`, `*.test.ts`.

- [x] Task 6: Server Actions и публичный API модуля `auth` (depends on 4, 5)
  - `src/modules/auth/slices/credentials/credentials.actions.ts` (`'use server'`), сигнатуры под `useActionState`: `(prev: ActionResult<null> | null, formData: FormData) => Promise<ActionResult<null>>`:
    - `signUpAction` / `signInAction`: `schema.parse(Object.fromEntries(formData))` → сервис → `redirect(returnTo ?? '/')` (безопасный `returnTo` из скрытого поля, та же проверка, что в Task 4; `redirect` вызывать вне `try/catch`);
    - `signOutAction`: сервис → `redirect('/login')`.
    - Ошибки → `toActionError(error)`.
  - Вынести проверку `returnTo` в `src/shared/access/safe-redirect.ts` (используется в guards и actions), покрыть тестом.
  - `src/modules/auth/index.ts`: экспорт actions и схем/типов форм.
  - Логирование: actions не логируют сами (это делают сервис и `toActionError`); `DEBUG [auth.actions] redirect { to }`.
  - Files: `src/modules/auth/slices/credentials/credentials.actions.ts`, `src/modules/auth/index.ts`, `src/shared/access/safe-redirect.ts`, `src/shared/access/safe-redirect.test.ts`.

<!-- Commit checkpoint: tasks 4-6 -->

### Phase 3: UI и маршрутизация

- [ ] Task 7: Proxy для оптимистичных редиректов (depends on 3)
  - `src/proxy.ts`: `getSessionCookie(request)` из `better-auth/cookies` (без обращения к БД):
    - нет cookie и путь не публичный → redirect на `/login?returnTo=<pathname+search>`;
    - есть cookie и путь `/login` или `/register` → redirect на `/`.
  - Публичные пути: `/login`, `/register`, `/api/auth/*`, `/api/health`; `matcher` исключает `_next/static`, `_next/image`, `favicon.ico` и статические файлы.
  - Комментарий: proxy — не авторизация; сервер всегда проверяет сессию через `requireUser*`.
  - Логирование: в proxy не используем pino (edge/proxy runtime и `server-only`); логов нет — диагностика через серверные guards.
  - Files: `src/proxy.ts`.

- [ ] Task 8: Страницы входа и регистрации (depends on 6)
  - `pnpm dlx shadcn@<version> add input label` (и `field`/`form`, если используется в текущем registry) — компоненты не правим вручную.
  - `src/app/(auth)/layout.tsx`: центрированная карточка, без session-запросов.
  - `src/app/(auth)/login/page.tsx` + `src/components/auth/sign-in-form.tsx` (`'use client'`): `useActionState(signInAction)`, поля email/пароль, скрытый `returnTo` из `searchParams`, ошибки полей из `fieldErrors`, общая ошибка — сообщение в форме, кнопка с `pending`-состоянием, ссылка на регистрацию.
  - `src/app/(auth)/register/page.tsx` + `src/components/auth/sign-up-form.tsx`: имя, email, пароль, подтверждение; клиентская валидация той же `signUpSchema` перед отправкой (опционально), серверная — обязательна.
  - `searchParams` — Promise в Next 16; сверить с `node_modules/next/dist/docs` (page.tsx API reference) и правилами Cache Components.
  - Компоненты импортируют только `@/modules/auth` (ESLint-границы).
  - Логирование: на клиенте не логируем; серверная часть логируется в Task 5.
  - Files: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/components/auth/sign-in-form.tsx`, `src/components/auth/sign-up-form.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`.

- [ ] Task 9: Защищённая зона `(app)` и заглушка админки (depends on 4, 6, 7)
  - Перенести `src/app/page.tsx` в `src/app/(app)/page.tsx`: приветствие с именем пользователя и ролью; убрать текст «Вход и регистрация появятся на следующем этапе».
  - `src/app/(app)/layout.tsx`: шапка с `UserMenu` в `<Suspense>` (по гайду authentication-with-cache-components); защита — `requireUserOrRedirect()` в session-зависимом компоненте/странице, а не top-level `await` в layout, блокирующий `{children}`.
  - `src/components/auth/user-menu.tsx`: имя, email, бейдж «Администратор» для `admin`, ссылка «Админка» только для `admin`, кнопка «Выйти» (`<form action={signOutAction}>`). Скрытие ссылки — UX, не защита.
  - `src/app/(app)/admin/page.tsx`: `requireAdminOrNotFound()`, заглушка «Администрирование ресурса — следующий этап».
  - Логирование: страницы не логируют; guards логируют отказ (Task 4).
  - Проверка вручную: регистрация → автологин → `/`; выход → `/login`; `/admin` под `user` → 404, под email из `ADMIN_EMAILS` → страница открывается; прямой заход на `/` без cookie → `/login?returnTo=%2F`; `pnpm build` проходит.
  - Files: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/admin/page.tsx`, `src/components/auth/user-menu.tsx`, удалить `src/app/page.tsx`.

<!-- Commit checkpoint: tasks 7-9 -->

## Риски и что проверить

- Совместимость `better-auth` Prisma-адаптера с генератором `prisma-client` (импорт `PrismaClient` из `@/generated/prisma/client`, ленивый Proxy-клиент из `src/shared/db`). Если адаптер не принимает Proxy — передавать реальный клиент через внутренний `getPrismaClient()` (экспортировать из `src/shared/db`).
- `nextCookies()` должен устанавливать cookie из Server Actions; проверить вручную в браузере (Set-Cookie после `signInAction`).
- `headers()` / `cookies()` под Cache Components: страницы, читающие сессию, не должны попадать в статический shell — проверить `pnpm build` на ошибки «uncached data outside Suspense».
- `pnpm check` и `pnpm build` должны оставаться зелёными после каждой commit-точки.
