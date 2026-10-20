# Правила дизайна интерфейса

> Короткие обязательные правила для UI. Подробности и брендбук — `docs/design.md`, живой UI-кит — `/admin/design` (только admin). Часть правил проверяет `src/components/design-system/style-guard.test.ts` в `pnpm check`.

## Цвета

- Цвет задаётся только токенами темы: `bg-card`, `text-muted-foreground`, `border-border`, `text-success`, `bg-warning/15` и т. п.
- Запрещены цвета палитры Tailwind (`text-red-600`, `bg-emerald-100`), значения в скобках (`[oklch(…)]`, `[#…]`) и HEX в `style`. Исключение — `entity-icon.tsx` (декоративная палитра плиток); новое исключение вносится в `ALLOWED_FILES` guard-теста с причиной.
- Смысловой цвет (успех, предупреждение, PR, приоритет, статус) берётся через тон: `src/components/design-system/tones.ts` (`TONE_TEXT`, `TONE_FILL`, `TONE_SOFT`, `statusTone`, `pullRequestTone`, `priorityTone` …). Новых `oklch` в компонентах не заводить.
- Новый токен добавляется в `src/app/globals.css` в `:root` и `.dark` (если зависит от темы), регистрируется в `@theme inline` и описывается в `src/components/design-system/token-catalog.ts`. Тест сверяет каталог с CSS.
- Фиксированные цвета для писем, фавикона и метаданных — только из `STATIC_HEX` в `token-catalog.ts`.

## Типографика и раскладка

- Заголовок страницы (h1) — только `PageHeader` из `@/components/layout/page-header`; заголовок раздела (h2) — `SectionHeading` (`size="section"` или `"group"`).
- Шрифт — Geist (уже подключён), без новых шрифтов. Мелкий служебный текст — `text-2xs`, не `text-[11px]`.
- Радиусы: `rounded-sm` (внутри чипов), `rounded-md` (чипы, бейджи), `rounded-lg` (кнопки, поля), `rounded-xl` (карточки, контейнеры), `rounded-full` (аватары, точки). Голый `rounded` не используется.
- Иконки — `lucide-react`, размеры `size-3.5` (плотные строки), `size-4` (по умолчанию), `size-5` (пустые состояния).
- Вёрстка работает от 375 px без горизонтальной прокрутки страницы; широкие ленты (вкладки, таблицы) прокручиваются внутри себя.

## Компоненты

- Пустое состояние — `EmptyState` (`@/components/feedback/empty-state`), блок-сообщение — `Callout` (`@/components/feedback/callout`), бейдж с тоном — `ToneBadge` / `ToneDot`, загрузка — `Skeleton` из `ui/skeleton`. Ошибка формы — `FormError`.
- Знак и логотип — только `Logo` / `LogoMark` из `@/components/brand/logo`; файлы знака — `public/brand/*`, после изменения геометрии — `pnpm brand:icons`.
- Письма собираются через `renderMailLayout` из `@/shared/mail`.
- `src/components/ui/**` правится только через shadcn CLI.
- Новый общий компонент или его вариант показывается на `/admin/design` (`src/components/design-system/design-system-sections.tsx`) в том же изменении.

## Тексты интерфейса

- Обращение на «вы», без восклицательных знаков, без жаргона.
- Кнопка — глагол действия («Создать задачу», «Сохранить»); опасное действие — `destructive` и подтверждение.
- Ошибка объясняет, что делать дальше («Не удалось сохранить. Попробуйте ещё раз.»).
