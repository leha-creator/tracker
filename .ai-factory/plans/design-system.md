# План реализации: дизайн-система, айдентика и UI-кит

Branch: none (`git.create_branches: false`, работа в текущей ветке)
Created: 2026-10-20

## Settings
- Testing: yes, только для логики и защиты от рассинхронизации. Vitest (`environment: node`, файлы `src/**/*.test.ts`):
  - каталог токенов (`token-catalog.ts`) совпадает с `globals.css`: каждый токен каталога объявлен и в `:root`, и в `.dark`, у каждого `--color-*` из `@theme inline` есть исходная переменная;
  - guard-тест: в `src/**/*.tsx` нет сырых цветов палитры Tailwind (`text-red-600`, `bg-amber-100` и т. п.), `[oklch(...)]`, `[#hex]` и `text-[0.6875rem]` вне списка исключений;
  - чистые функции тонов: `statusTone`, `pullRequestTone`, `priorityTone`;
  - общий шаблон письма: экранирование, кнопка-ссылка, текстовая версия;
  - упаковщик ICO в скрипте иконок (заголовок и таблица записей).
  Вёрстку проверять скриншотами Playwright на 1440 и 375 px, в светлой и тёмной теме.
- Logging: standard. Задачи в основном про UI: в клиентских компонентах `console.*` запрещён (ESLint), новых серверных побочных эффектов почти нет.
  - Страница `/admin/design` серверную логику не добавляет, логирование не нужно.
  - Общий шаблон письма (`src/shared/mail/`) не логирует: отправка уже логируется в `sendMail()`.
  - Скрипт `scripts/brand/generate-icons.mjs` пишет в консоль с префиксом `[brand-icons]`, в стиле `scripts/run-reminders.mjs`: исходный SVG, каждый созданный файл с размером в байтах, итог. При ошибке пишет шаг и путь и выходит с кодом 1.
- Docs: yes. Обязательный docs-чекпоинт в конце (`/aif-docs`): `docs/design.md` (новый брендбук), `docs/architecture.md`, `docs/development.md`, `AGENTS.md`, `.ai-factory/ROADMAP.md`.

## Roadmap Linkage
Milestone: "Удобство работы"
Rationale: единый визуальный язык и защита от расхождений продолжают этап «Интерфейс и удобство»; подпункт «Дизайн-система и айдентика» добавить в ROADMAP.md в задаче 17.

## Контекст: итоги аудита интерфейса

Тема уже собрана на токенах: холодные нейтральные цвета (оттенок 265), приглушённый индиго `--primary: oklch(0.5 0.13 270)`, рабочая тёмная тема (next-themes), `shadow-card`. h1 почти везде одинаковый (`text-2xl font-semibold tracking-tight`, 16 из 23). Проблемы сосредоточены в нескольких местах:

1. **Нет семантических токенов** `--success`, `--warning`, `--info`. Предупреждение (amber) свёрстано тремя разными способами: `github-app-setup.tsx`, `impersonation-banner.tsx`, `audit-event-list.tsx`. Успех (emerald) — в `github-app-setup.tsx`.
2. **Скрытая палитра в arbitrary values.** `projects/status-badge.tsx` (12 значений `oklch` на 6 цветов `StatusColor`) и `github/pr-state.tsx` (8 значений) описывают одни и те же зелёный, красный, фиолетовый и янтарный с немного разными числами. Приоритет (`priority-badge.tsx`) — `text-orange-600` и `text-red-600`.
3. **Пустые состояния скопированы примерно в 12 местах**, в трёх вариантах вёрстки (`border-dashed p-8`, `<p> px-4 py-8`, `px-6 py-10`).
4. **h2 оформлены десятью разными способами** (`text-base font-medium`, `text-base font-semibold`, `text-lg font-semibold`…). Общего заголовка страницы нет, h1 повторяется вручную в 23 файлах.
5. **Скелетонов нет:** `ui/skeleton` отсутствует, заглушки в шапке — самодельные `animate-pulse` div.
6. **Мелкие расхождения:** `text-[0.6875rem]` (11 px) встречается многократно без токена; голый `rounded` (20 раз) вне шкалы радиусов.
7. **Айдентики нет.** Знак — inline-SVG «три колонки» внутри `(app)/layout.tsx`. Есть только `src/app/favicon.ico` (стандартный), нет `icon.svg`, `apple-icon`, манифеста, `themeColor`, Open Graph. На страницах входа логотипа нет.
8. **Письма без оформления:** три файла (`shared/auth/auth-emails.ts`, `notifications/.../notification.mail.ts`, `workspaces/.../invitation.mail.ts`) повторяют один и тот же inline-HTML (`system-ui`, `#111`, `#666`).
9. **Нет зафиксированных правил:** в `.ai-factory/rules/` только `base.md`, в ESLint и тестах нет ограничений на цвета.

## Принятые решения (поправьте до `/aif-implement`, если не согласны)

1. **Знак — галочка в плитке.** Скруглённый квадрат цвета бренда (радиус ≈ 28 % стороны) с белой галочкой с округлыми концами. Толщина линии подобрана так, чтобы знак читался в 16 px. Словесный знак — «Tasker» шрифтом Geist Semibold, `tracking-tight`. Комплект:
   - `LogoMark` — только знак, размеры `sm` (24), `md` (28, шапка), `lg` (40, вход);
   - `Logo` — знак и слово по горизонтали;
   - монохромный вариант (`currentColor`) для мест без цвета.
   Цвет плитки в приложении — `bg-primary`, то есть в тёмной теме он светлее. В статичных файлах (фавикон, письма, OG) — фиксированный цвет бренда `--brand` = светлый `--primary`. Его HEX вычисляется один раз и записывается в каталог токенов и `docs/design.md`.
2. **Брендбук и UI-кит — живая страница `/admin/design`** (только для admin, новая вкладка «Дизайн» в `AdminNav`). Она собрана из настоящих компонентов приложения, поэтому не расходится с кодом. Текстовые правила — в `docs/design.md` (для людей) и `.ai-factory/rules/design.md` (для агентов, коротко и императивно). Storybook не используем.
3. **Защита от рассинхронизации — тесты в `pnpm check`**, без нового ESLint-плагина:
   - `token-catalog.ts` — единственный TS-список токенов с подписями и назначением. Из него рисуется страница UI-кита, а тест сверяет его с `globals.css`;
   - guard-тест запрещает сырые цвета палитры, `[oklch(`, `[#…]` и `text-[0.6875rem]` в `src/**/*.tsx`. Исключения: `src/components/ui/**` (генерирует shadcn) и `entity-icon.tsx` (декоративная палитра плиток, задокументирована);
   - новые правила записываются в `.ai-factory/rules/design.md` и подключаются в `.ai-factory/config.yaml` (`rules.frontend`), чтобы `/aif-review` и `/aif-rules-check` их видели.
4. **Тона вместо цветов.** В `globals.css` добавляются:
   - семантические токены `--success`, `--warning`, `--info` (и `*-foreground`) для обеих тем;
   - шкала тонов `--tone-{gray,blue,green,amber,red,violet}` и тёмный вариант `--tone-*-strong` (для белого текста, контраст ≥ 4.5:1) — значения переносятся из `status-badge.tsx`;
   - `--text-2xs` (0.6875rem) в `@theme`.
   PR-состояния, приоритеты и статусы получают тон через чистые функции, а не через свои `oklch`. «Срочный» приоритет = `destructive`, «Высокий» = `warning`.
5. **Новые общие компоненты** (shadcn-файлы в `ui/` вручную не правим, только добавляем CLI):
   - `ui/skeleton`, `ui/alert`, `ui/separator` — через `pnpm dlx shadcn@latest add`;
   - `src/components/layout/page-header.tsx` — `PageHeader` (h1, описание, действия справа, варианты переноса и обрезки) и `SectionHeading` (h2 двух размеров: `section` — `text-lg font-semibold`, `group` — `text-base font-semibold`);
   - `src/components/feedback/empty-state.tsx` — `EmptyState` (иконка, заголовок, текст, действие; варианты `default` и `compact`);
   - `src/components/feedback/callout.tsx` — `Callout` на основе `ui/alert` с тонами `info | success | warning | destructive`;
   - `src/components/feedback/tone-badge.tsx` — `ToneBadge` и `ToneDot` на основе `ui/badge`.
6. **Иконки приложения — статичные файлы**, а не `icon.tsx` с `ImageResponse`. `proxy.ts` пропускает только адреса с расширением, иначе `/icon` редиректил бы на `/login`. Файлы:
   - `src/app/icon.svg` (с медиазапросом `prefers-color-scheme` для тёмной вкладки);
   - `src/app/favicon.ico` (16/32/48);
   - `src/app/apple-icon.png` (180);
   - `src/app/manifest.ts` → `/manifest.webmanifest` с иконками 192 и 512 из `public/brand/`;
   - `src/app/opengraph-image.png` (1200×630).
   PNG и ICO собирает скрипт `pnpm brand:icons`: Playwright уже есть в devDependencies, он рендерит SVG, а маленький упаковщик ICO (PNG внутри ICO) пишется вручную. Новых зависимостей нет. Сгенерированные файлы коммитятся.
7. **Письма — общий шаблон** `src/shared/mail/mail-layout.ts`: шапка с логотипом (PNG по абсолютному адресу `BETTER_AUTH_URL/brand/logo-mail.png`, alt «Tasker»), основной текст, кнопка цвета бренда, серый подвал. Все стили inline, ширина 560 px, без внешних шрифтов. Три файла писем переходят на шаблон, тексты писем не меняются.
8. **Вне объёма:** route-level `loading.tsx`, редизайн отдельных экранов, смена шрифта и акцента. Здесь только приведение существующего UI к правилам.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(design): brand tokens, tone palette and token catalog`
- **Commit 2** (после задач 4–6): `feat(brand): logo, app icons, manifest and branded emails`
- **Commit 3** (после задач 7–8): `feat(ui): shared page header, empty state, callout and tone badge`
- **Commit 4** (после задач 9–12): `refactor(ui): align screens with design tokens and shared components`
- **Commit 5** (после задач 13–14): `feat(admin): design system page and style guard tests`
- **Commit 6** (после задач 15–17): `docs(design): brand book, design rules and refreshed help screenshots`

Перед пушем выполнить `pnpm build` (см. память: `pnpm check` не ловит ошибки бандла и пререндера, а пуш в `main` деплоит).

## Tasks

### Phase 1: Токены

- [x] **Task 1: Семантические токены, тона и `--text-2xs` в `globals.css`**
  В `src/app/globals.css`:
  - добавить в `:root` и `.dark` `--success`, `--success-foreground`, `--warning`, `--warning-foreground`, `--info`, `--info-foreground`. Значения в той же oklch-гамме: success ≈ hue 160, warning ≈ hue 75, info ≈ hue 230 (не путать с индиго 270);
  - перенести 6 тонов из `DOT_CLASSES` и `COUNT_CLASSES` (`src/components/projects/status-badge.tsx`) в `--tone-*` и `--tone-*-strong`. Значения те же, в `.dark` при необходимости подобрать отдельно;
  - добавить `--brand` (фиксированный, равен светлому `--primary`) — для статичных материалов, в UI не используется;
  - зарегистрировать всё в `@theme inline` (`--color-success`, `--color-tone-green`, `--color-tone-green-strong`, …) и добавить `--text-2xs: 0.6875rem` с `--text-2xs--line-height`;
  - обновить комментарий-шапку палитры: что за группа токенов и где их список (`token-catalog.ts`).
  Проверка: `bg-success`, `text-tone-violet`, `text-2xs` генерируются (временный класс на странице или `pnpm build`).
  Логирование: не требуется (CSS).

- [x] **Task 2: Каталог токенов и тест сверки с `globals.css`**
  Создать `src/components/design-system/token-catalog.ts`: группы `surface`, `text`, `brand`, `semantic`, `tone`, `chart`, `radius`, `shadow`, `layout`. У каждого токена — CSS-имя, подпись по-русски, назначение («фон карточек», «предупреждения»…), признак «есть в тёмной теме». Туда же — шкала типографики (`TYPE_SCALE`: h1, h2-section, h2-group, body, small, 2xs с готовыми классами), размеры иконок (`ICON_SIZES`: `size-3.5` в плотных строках, `size-4` по умолчанию, `size-5` в пустых состояниях) и радиусы (`rounded-md` — чипы, `rounded-lg` — элементы управления, `rounded-xl` — карточки и контейнеры, `rounded-full` — аватары и точки).
  Создать `src/components/design-system/token-catalog.test.ts` (по образцу `src/app/globals-css.test.ts`, чтение файла как текста):
  - каждый токен каталога с цветом объявлен в `:root`, а с признаком тёмной темы — в `.dark`;
  - каждый `--color-X: var(--Y)` в `@theme inline` ссылается на объявленную `--Y`;
  - в `globals.css` нет токенов `--success|--warning|--info|--tone-*`, которых нет в каталоге (новый токен без описания роняет тест).
  Логирование: не требуется.
  Зависит от задачи 1.

- [x] **Task 3: Чистые функции тонов**
  Создать `src/components/design-system/tones.ts`:
  - тип `Tone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive' | 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet'`;
  - карты полных имён классов (Tailwind находит их в исходниках) `TONE_TEXT`, `TONE_FILL`, `TONE_FILL_STRONG`, `TONE_SOFT` (мягкий фон с `color-mix` / `/15`);
  - `statusTone(color: StatusColor)`, `pullRequestTone(state)`, `reviewTone(state)`, `checksTone(state)`, `priorityTone(priority)`.
  Тест `tones.test.ts`: у каждого значения `StatusColor`, `PullRequestState`, `ReviewState`, `ChecksState`, `TaskPriority` есть тон; классы — строковые литералы без `[`.
  Логирование: не требуется.
  Зависит от задачи 1.

### Phase 2: Айдентика

- [x] **Task 4: Логотип и знак**
  Создать `src/components/brand/logo.tsx`: `LogoMark` (`size: 'sm' | 'md' | 'lg'`, `variant: 'color' | 'mono'`) и `Logo` (знак и «Tasker», проп `hideWordmarkOnMobile`). SVG inline, `aria-hidden` у знака, у ссылки-обёртки — доступное имя. Геометрия знака (viewBox 32×32, плитка `rx≈9`, галочка `stroke-width≈3.5`, `stroke-linecap/linejoin: round`) — одна константа `MARK_PATHS`, её же использует скрипт иконок.
  Создать исходники `public/brand/logo-mark.svg` (цвет `--brand` в HEX), `public/brand/logo-mark-mono.svg`, `public/brand/logo.svg` (знак и слово, слово переведено в кривые или с `font-family` Geist и fallback).
  Заменить `LogoMark` в `src/app/(app)/layout.tsx` на `<Logo hideWordmarkOnMobile />` и удалить локальную функцию. В `src/app/(auth)/layout.tsx` поставить `Logo` (`lg`) над формой, ссылкой на `/`.
  Логирование: не требуется.

- [x] **Task 5: Фавикон, иконки, манифест, метаданные**
  Создать `scripts/brand/generate-icons.mjs` и команду `pnpm brand:icons` в `package.json`:
  - Playwright (chromium headless) рендерит `public/brand/logo-mark.svg` в PNG 16, 32, 48, 180, 192, 512;
  - OG-картинку 1200×630 рендерит из HTML-шаблона `scripts/brand/og-template.html` (фон `--background`, `Logo`, подзаголовок из `metadata.description`);
  - `logo-mail.png` (знак и слово, 2× для ретины);
  - функция `packIco(pngs)` (вынести в `scripts/brand/ico.mjs`, тест `scripts/brand/ico.test.ts` или `.mjs` в include Vitest — проверить `vitest.config.ts`) пишет `src/app/favicon.ico`.
  Результаты: `src/app/favicon.ico`, `src/app/icon.svg` (копия знака с `<style>@media (prefers-color-scheme: dark)</style>`), `src/app/apple-icon.png`, `src/app/opengraph-image.png`, `public/brand/icon-192.png`, `public/brand/icon-512.png`, `public/brand/logo-mail.png`.
  Создать `src/app/manifest.ts` (`name`, `short_name: 'Tasker'`, `start_url: '/'`, `display: 'standalone'`, `theme_color`, `background_color`, иконки 192/512 и `purpose: 'any maskable'` с отступом под маску).
  В `src/app/layout.tsx`: `metadata.title` в виде `{ default: 'Tasker', template: '%s — Tasker' }` (проверить, что существующие заголовки страниц не задвоятся; справка уже пишет `… — Справка Tasker`, её привести к шаблону), `metadataBase` из `BETTER_AUTH_URL`, `openGraph` (siteName, locale `ru_RU`), `export const viewport` с `themeColor` для светлой и тёмной темы.
  Проверить, что `src/proxy.ts` не редиректит `/icon.svg`, `/apple-icon.png`, `/manifest.webmanifest`, `/opengraph-image.png`, `/brand/*` (все с расширением) — `curl -I` без cookie даёт 200.
  Логирование: скрипт — `[brand-icons]` (см. Settings), в приложении не требуется.
  Зависит от задачи 4.

- [x] **Task 6: Общий шаблон писем**
  Создать `src/shared/mail/mail-layout.ts`: `renderMailLayout({ title, paragraphs, action?, footer? })` → `{ html, text }`. Шапка: `logo-mail.png` по абсолютному адресу из `getEnv().BETTER_AUTH_URL` (`width`/`height`, alt «Tasker»). Кнопка: `background: <brand HEX>`, белый текст, `border-radius: 8px`. Под кнопкой — ссылка текстом для клиентов без картинок. Подвал серый. Все пользовательские строки через `escapeHtml`. Цвета — константы `MAIL_COLORS` с комментарием, что это HEX-копии токенов из `token-catalog.ts`.
  Перевести на шаблон `src/shared/auth/auth-emails.ts` (`render`), `src/modules/notifications/slices/notification/notification.mail.ts`, `src/modules/workspaces/slices/invitation/invitation.mail.ts`. Тексты и темы писем не меняются, существующие тесты писем должны пройти без правок или с правкой только HTML-ожиданий.
  Экспортировать из `src/shared/mail/index.ts`.
  Тест `mail-layout.test.ts`: экранирование заголовка, абзацев и URL кнопки; в `text` есть ссылка; в `html` есть адрес логотипа на базе `BETTER_AUTH_URL`.
  Проверка: письма сброса пароля, приглашения и уведомления в Mailpit (http://localhost:8025) — светлый клиент, без сломанной вёрстки.
  Логирование: не добавлять (отправку логирует `sendMail`).
  Зависит от задачи 5 (`logo-mail.png`).

### Phase 3: Общие компоненты

- [x] **Task 7: shadcn-примитивы и компоненты обратной связи**
  Добавить через CLI: `pnpm dlx shadcn@latest add skeleton alert separator` (проверить, что CLI не перезаписал изменённые ранее файлы `ui/`; `git diff src/components/ui` — только новые файлы).
  Создать `src/components/feedback/`:
  - `empty-state.tsx` — `EmptyState({ icon?, title, description?, action?, variant: 'default' | 'compact' })`. `default`: `grid justify-items-center gap-3 rounded-xl border border-dashed p-8 text-center`; `compact`: однострочный `<p>` в рамке. Заголовок — `text-sm font-medium`, текст — `text-sm text-muted-foreground`;
  - `callout.tsx` — `Callout({ tone: 'info' | 'success' | 'warning' | 'destructive', title?, children, icon? })` на `ui/alert`, тон через `TONE_SOFT` / `TONE_TEXT`;
  - `tone-badge.tsx` — `ToneBadge({ tone, children, dot? })` на `ui/badge` (`variant="outline"`, мягкий фон тона) и `ToneDot({ tone, strong? })`.
  Логирование: не требуется.
  Зависит от задачи 3.

- [x] **Task 8: `PageHeader` и `SectionHeading`**
  Создать `src/components/layout/page-header.tsx`:
  - `PageHeader({ title, description?, actions?, overflow: 'wrap' | 'truncate' | 'wrap-mobile-truncate', titleAddon? })` — h1 `text-2xl font-semibold tracking-tight`, описание `text-sm text-muted-foreground`, действия справа с переносом под заголовок на мобильных;
  - `SectionHeading({ as = 'h2', size: 'section' | 'group', description?, actions? })`.
  Варианты `overflow` покрывают все найденные сейчас комбинации h1 (`break-words`, `truncate`, `min-w-0 … sm:truncate`). `SettingsSection` (`layout/settings-section.tsx`) переводится на `SectionHeading` внутри.
  Логирование: не требуется.

### Phase 4: Приведение интерфейса к правилам

- [x] **Task 9: Тона в статусах, PR и приоритетах**
  - `src/components/projects/status-badge.tsx`: `DOT_CLASSES` и `COUNT_CLASSES` → `TONE_FILL[statusTone(c)]` / `TONE_FILL_STRONG[…]`. Экспорт `StatusDot`, `StatusCount`, `statusFillClass` сохраняется (его используют дашборд, метки и теги). `text-[0.6875rem]` → `text-2xs`.
  - `src/components/github/pr-state.tsx`: все `text-[oklch(...)]` → `TONE_TEXT[pullRequestTone/reviewTone/checksTone(...)]`.
  - `src/components/tasks/priority-badge.tsx`: `PRIORITY_TONES` → `priorityTone` (`high` → `warning`, `urgent` → `destructive`).
  Проверка: доска, список, дашборд, раздел GitHub задачи в обеих темах — цвета визуально те же (статусы) или в общей гамме (PR).
  Логирование: не требуется.
  Зависит от задач 3, 7.

- [x] **Task 10: Предупреждения и успех через `Callout` и `ToneBadge`**
  - `src/components/admin/github-app-setup.tsx` (строки ≈50 и ≈164) → `Callout tone="success"` / `tone="warning"`;
  - `src/components/layout/impersonation-banner.tsx` → токены `warning` (баннер остаётся полосой на всю ширину, не `Callout`);
  - `src/components/audit/audit-event-list.tsx` → `ToneBadge tone="warning"`;
  - найти прочие самодельные плашки (`grep -rn "bg-destructive/10\|border-destructive" src/components src/app`) и перевести на `Callout tone="destructive"`, где это блок-сообщение (ошибки форм `FormError` не трогать, если они уже единообразны).
  Логирование: не требуется.
  Зависит от задачи 7.

- [x] **Task 11: Пустые состояния и скелетоны**
  Заменить на `EmptyState` все копии (≈12):
  - вариант A: `admin/users/page.tsx`, `admin/workspaces/page.tsx`, `w/[workspaceSlug]/overview/page.tsx`, `w/[workspaceSlug]/docs/page.tsx`;
  - вариант B (`compact`): `admin/users/detail/user-memberships.tsx`, `user-sessions-list.tsx`, `api-tokens/activity-feed.tsx`, `api-tokens-table.tsx`, `audit/audit-event-list.tsx`;
  - вариант C: `w/[workspaceSlug]/docs/[documentId]/page.tsx`;
  - остальные — по `grep -rn "border-dashed" src/app src/components` (зоны перетаскивания файлов `EmptyState` не являются, их не трогать).
  Заменить самодельные `animate-pulse` div на `Skeleton`: fallback'и в `src/app/(app)/layout.tsx`, `auth/form-skeleton.tsx`, прочие по `grep -rn animate-pulse src`.
  Логирование: не требуется.
  Зависит от задачи 7.

- [x] **Task 12: Заголовки, типографика и радиусы**
  - Все 23 h1 → `PageHeader` (кроме `sr-only`): по `grep -rln "<h1" src/app src/components`.
  - h2 → `SectionHeading` по правилу: секция страницы — `section`, блок внутри карточки или панели — `group`. Оставить как есть h2 внутри `ui/` и Markdown-рендера.
  - `text-[0.6875rem]` и прочие `text-[…]` с размерами шкалы → `text-2xs` / `text-xs`. Оставшиеся arbitrary значения (`w-[min(…)]`, `w-[45%]`) не трогать: это раскладка, не цвет и не типографика.
  - Голый `rounded` (≈20) → `rounded-md` или `rounded-sm` по назначению.
  Проверка: скриншоты Playwright главной, пространства, доски, списка, задачи, документов, профиля, админки на 1440 и 375 px (горизонтальной прокрутки нет), сравнение до и после.
  Логирование: не требуется.
  Зависит от задачи 8.

### Phase 5: UI-кит и защита от рассинхронизации

- [x] **Task 13: Страница `/admin/design` — брендбук и UI-кит**
  Создать `src/app/(app)/admin/design/page.tsx` (доступ через существующий `admin/layout.tsx`, `requireAdminOrNotFound`), вкладка «Дизайн» в `src/components/admin/admin-nav.tsx`. Компоненты разделов — в `src/components/design-system/` (`brand-section.tsx`, `color-section.tsx`, `type-section.tsx`, …). Разделы с якорями и оглавлением:
  1. **Бренд** — `Logo`, `LogoMark` во всех размерах и вариантах на светлом и тёмном фоне, охранное поле и минимальный размер, запрещённые приёмы (растягивать, менять цвет плитки, тень), ссылки на файлы `public/brand/*`.
  2. **Цвета** — образцы из `token-catalog.ts`: имя, назначение, текущее значение (клиентский компонент читает `getComputedStyle` — видно и в тёмной теме).
  3. **Типографика** — `TYPE_SCALE` образцами, `PageHeader`, `SectionHeading`.
  4. **Радиусы, тени, отступы, иконки** — `ICON_SIZES`, правила радиусов.
  5. **Элементы управления** — `Button` (все `variant` × `size`, disabled), `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Tabs`, `FormField` с ошибкой.
  6. **Статусы и тона** — `ToneBadge`, `ToneDot`, `StatusDot`, `StatusCount`, `PriorityBadge`, состояния PR, `TagBadge`, `AudienceBadge`, `ViaAgentBadge`.
  7. **Обратная связь** — `Callout` × 4, `EmptyState` × 2, `Skeleton`, `toast` (кнопка-демо).
  8. **Составные** — `TaskCard` на демо-данных (если требует контекст доски — обернуть в минимальный провайдер или показать статичную версию), `UserAvatar`, `EntityIconTile`.
  Демо-данные — константы в `src/components/design-system/demo-data.ts`, без запросов к БД.
  Логирование: не требуется (страница без серверных побочных эффектов).
  Зависит от задач 2, 4, 7, 8, 9.

- [x] **Task 14: Guard-тест стиля**
  Создать `src/components/design-system/style-guard.test.ts`: обходит `src/**/*.tsx` (кроме `src/components/ui/**`, `src/generated/**`) и падает с перечнем `файл:строка` при:
  - `\b(text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide|shadow)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b`;
  - `\[(oklch|rgb|hsl)\(` и `\[#[0-9a-fA-F]{3,8}\]` в классах;
  - `text-\[0\.6875rem\]`;
  - inline `style={{ color: '#…' }}`.
  Исключения — явный список `ALLOWED_FILES` с причиной (`entity-icon.tsx` — декоративная палитра плиток пространств и проектов). Новое исключение требует комментария с причиной, это написано в сообщении теста.
  Перед включением прогнать и добить оставшиеся нарушения (задачи 9–12 должны были убрать все).
  Логирование: не требуется.
  Зависит от задач 9–12.

### Phase 6: Правила и документация

- [x] **Task 15: Правила дизайна для агентов**
  Создать `.ai-factory/rules/design.md` — короткие императивные правила:
  - цвета только токенами, тона через `tones.ts`, новый токен добавляется в `globals.css` (обе темы) и в `token-catalog.ts`;
  - h1 только через `PageHeader`, h2 через `SectionHeading`;
  - пустое состояние — `EmptyState`, сообщение-блок — `Callout`, загрузка — `Skeleton`;
  - шкала радиусов и размеров иконок;
  - знак — только `Logo` / `LogoMark`;
  - новый общий компонент или вариант показывается на `/admin/design` в том же PR;
  - `src/components/ui/**` правится только через shadcn CLI.
  Подключить в `.ai-factory/config.yaml`: `rules.frontend: .ai-factory/rules/design.md`. В `AGENTS.md`, раздел «Правила для агентов», добавить пункт со ссылкой на файл и `/admin/design`.
  Логирование: не требуется.

- [x] **Task 16: Обновить скриншоты справки**
  Логотип в шапке и пустые состояния меняют скриншоты в `public/help-media/`. Переснять командой `pnpm help:screenshots` на отдельном сервере с чистой базой (см. `docs/development.md`). Проверить несколько статей `/help` на 1440 px.
  Логирование: скрипт уже пишет прогресс `[help-screenshots]`, менять не нужно.
  Зависит от задач 4, 9–12.

- [x] **Task 17: Документация (docs-чекпоинт)**
  Через `/aif-docs`:
  - создать `docs/design.md` — брендбук для людей: идея знака, комплект логотипов и файлов, цвет бренда (OKLCH и HEX), палитра и тона, типографика, радиусы, иконки, тон текстов интерфейса (обращение на «вы», без восклицаний, кнопка = глагол), письма, как добавить токен или компонент, ссылка на `/admin/design`;
  - `docs/architecture.md`, раздел «Раскладка, навигация и тема»: токены и тона, `feedback/`, `brand/`, `design-system/`, guard-тесты;
  - `docs/development.md`: `pnpm brand:icons`, правило «новый компонент — на страницу UI-кита»;
  - `AGENTS.md`: новые папки (`src/components/brand/`, `feedback/`, `design-system/`, `public/brand/`, `scripts/brand/`), `/admin/design` в структуре `app`, команда `pnpm brand:icons`, строка о `docs/design.md` в таблице документации;
  - `.ai-factory/ROADMAP.md`: подпункт «Дизайн-система и айдентика» в этапе «Удобство работы» (план `design-system`).
  Логирование: не требуется.
  Зависит от всех задач.
