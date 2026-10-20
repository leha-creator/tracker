import { FileTextIcon, InboxIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { ViaAgentBadge } from '@/components/agents/via-agent-badge';
import { Logo, LogoMark } from '@/components/brand/logo';
import { TagBadge } from '@/components/documents/tag-badge';
import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import { Callout } from '@/components/feedback/callout';
import { EmptyState } from '@/components/feedback/empty-state';
import { ToneBadge, ToneDot } from '@/components/feedback/tone-badge';
import { FormField } from '@/components/forms/form-field';
import { ChecksIndicator, PrStateBadge, ReviewBadge } from '@/components/github/pr-state';
import { AudienceBadges } from '@/components/help/audience-badge';
import { PageHeader, SectionHeading } from '@/components/layout/page-header';
import { StatusCount, StatusDot } from '@/components/projects/status-badge';
import { PriorityBadge } from '@/components/tasks/priority-badge';
import { TaskCard } from '@/components/tasks/task-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/users/user-avatar';
import { STATUS_COLOR_LABELS, STATUS_COLORS } from '@/modules/projects/client';
import { TASK_PRIORITIES } from '@/modules/tasks/client';
import { ENTITY_ICONS } from '@/shared/entity-icon';

import { DEMO_CARDS, DEMO_USERS } from './demo-data';
import { DsCode, DsSample, DsSection } from './ds-section';
import { ToastDemo } from './toast-demo';
import { ICON_SIZES, RADII, STATIC_HEX, TYPE_SCALE } from './token-catalog';
import { TokenSwatches } from './token-swatches';

/** Разделы страницы: id якоря и подпись в оглавлении. */
export const DESIGN_SECTIONS = [
  { id: 'brand', title: 'Бренд' },
  { id: 'colors', title: 'Цвета' },
  { id: 'type', title: 'Типографика' },
  { id: 'foundations', title: 'Радиусы, тени, иконки' },
  { id: 'controls', title: 'Элементы управления' },
  { id: 'statuses', title: 'Статусы и тона' },
  { id: 'feedback', title: 'Обратная связь' },
  { id: 'composite', title: 'Составные компоненты' },
] as const;

const BRAND_FILES = [
  { href: '/brand/logo.svg', label: 'logo.svg — знак и слово' },
  { href: '/brand/logo-mark.svg', label: 'logo-mark.svg — знак' },
  { href: '/brand/logo-mark-mono.svg', label: 'logo-mark-mono.svg — одноцветный знак' },
  { href: '/brand/icon-512.png', label: 'icon-512.png — иконка приложения' },
  { href: '/brand/og.png', label: 'og.png — обложка 1200×630' },
] as const;

/** Брендбук и UI-кит из настоящих компонентов приложения. */
export function DesignSystemSections() {
  return (
    <div className="grid gap-12">
      <DsSection
        id="brand"
        title="Бренд"
        description="Знак — галочка в скруглённой плитке: задача сделана. Слово — Geist Semibold. Компоненты: Logo и LogoMark."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <DsSample label="Текущая тема" hint={<DsCode>{'<Logo size="lg" />'}</DsCode>}>
            <Logo size="lg" />
          </DsSample>
          <div className="dark grid content-start gap-2 rounded-xl border bg-background p-4 text-foreground">
            <div className="flex min-h-10 items-center">
              <Logo size="lg" />
            </div>
            <p className="text-sm font-medium">Тёмный фон</p>
            <p className="text-xs text-muted-foreground">Плитка берёт primary тёмной темы</p>
          </div>
          <DsSample label="Размеры знака" hint="sm 24 · md 28 (шапка) · lg 40 (вход)">
            <LogoMark size="sm" />
            <LogoMark size="md" />
            <LogoMark size="lg" />
          </DsSample>
          <DsSample
            label="Одноцветный"
            hint="Для мест без цвета: печать, водяные знаки. Цвет — currentColor"
          >
            <LogoMark size="lg" variant="mono" />
            <Logo size="md" variant="mono" />
          </DsSample>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid content-start gap-2 rounded-xl border bg-card p-4 text-sm">
            <p className="font-medium">Правила</p>
            <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
              <li>Охранное поле вокруг знака — не меньше четверти его стороны.</li>
              <li>Минимальный размер знака — 16 px, со словом — 24 px по высоте.</li>
              <li>Не растягивать, не поворачивать, не менять цвет плитки, не добавлять тень.</li>
              <li>В интерфейсе — только компоненты Logo и LogoMark, не картинки.</li>
            </ul>
          </div>
          <div className="grid content-start gap-2 rounded-xl border bg-card p-4 text-sm">
            <p className="font-medium">
              Файлы · цвет бренда <DsCode>{STATIC_HEX.brand}</DsCode>
            </p>
            <ul className="grid gap-1">
              {BRAND_FILES.map((file) => (
                <li key={file.href}>
                  <a href={file.href} download className="text-primary hover:underline">
                    {file.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              PNG и ICO пересобирает <DsCode>pnpm brand:icons</DsCode>.
            </p>
          </div>
        </div>
      </DsSection>

      <DsSection
        id="colors"
        title="Цвета"
        description={
          <>
            Только токены темы: <DsCode>bg-card</DsCode>, <DsCode>text-muted-foreground</DsCode>,{' '}
            <DsCode>text-success</DsCode>. Палитра Tailwind (<DsCode>text-red-*</DsCode>) и значения
            в скобках запрещены тестом. Значения ниже — текущей темы.
          </>
        }
      >
        <TokenSwatches />
      </DsSection>

      <DsSection
        id="type"
        title="Типографика"
        description="Шрифт Geist. h1 — только PageHeader, h2 — SectionHeading."
      >
        <div className="grid gap-2 rounded-xl border bg-card p-4">
          {TYPE_SCALE.map((item) => (
            <div
              key={item.name}
              className="grid gap-1 border-b py-3 last:border-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-baseline"
            >
              <span className="grid gap-0.5">
                <span className="text-xs font-medium">{item.label}</span>
                <DsCode>{item.usage}</DsCode>
              </span>
              <span className={item.className}>Задачи пространства «Студия Линия»</span>
            </div>
          ))}
        </div>
        <div className="grid gap-4 rounded-xl border bg-card p-4">
          <PageHeader
            title="Заголовок страницы"
            description="Описание под заголовком — одна-две строки."
            actions={<Button size="sm">Действие</Button>}
          />
          <SectionHeading
            title="Раздел страницы"
            description="SectionHeading size=section"
            actions={
              <Button size="sm" variant="outline">
                Ещё
              </Button>
            }
          />
          <SectionHeading size="group" title="Группа в карточке" />
        </div>
      </DsSection>

      <DsSection id="foundations" title="Радиусы, тени, иконки">
        <div className="grid gap-3 md:grid-cols-3">
          {RADII.map((radius) => (
            <DsSample key={radius.className} label={radius.className} hint={radius.usage}>
              <span
                className={`size-12 border-2 border-primary/60 bg-accent ${radius.className}`}
              />
            </DsSample>
          ))}
          <DsSample label="shadow-card" hint="Карточки доски и списков">
            <span className="size-12 rounded-lg bg-card shadow-card" />
          </DsSample>
          <DsSample label="shadow-card-hover" hint="Наведение на карточку">
            <span className="size-12 rounded-lg bg-card shadow-card-hover" />
          </DsSample>
          {ICON_SIZES.map((icon) => (
            <DsSample key={icon.className} label={icon.className} hint={icon.usage}>
              <FileTextIcon aria-hidden className={icon.className} />
              <span className="text-xs text-muted-foreground">только lucide-react</span>
            </DsSample>
          ))}
        </div>
      </DsSection>

      <DsSection
        id="controls"
        title="Элементы управления"
        description="Кнопка — глагол: «Создать задачу», не «ОК». Опасное действие — destructive и подтверждение."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <DsSample
            label="Button: варианты"
            hint="default · outline · secondary · ghost · destructive · link"
          >
            <Button>Создать</Button>
            <Button variant="outline">Отмена</Button>
            <Button variant="secondary">Вторичная</Button>
            <Button variant="ghost">Призрачная</Button>
            <Button variant="destructive">
              <Trash2Icon aria-hidden />
              Удалить
            </Button>
            <Button variant="link">Ссылка</Button>
          </DsSample>
          <DsSample label="Button: размеры" hint="xs · sm · default · lg · icon">
            <Button size="xs">xs</Button>
            <Button size="sm">sm</Button>
            <Button>default</Button>
            <Button size="lg">lg</Button>
            <Button size="icon" aria-label="Добавить">
              <PlusIcon aria-hidden />
            </Button>
            <Button disabled>Недоступна</Button>
          </DsSample>
          <DsSample label="FormField" hint="Подпись, поле, ошибка с сервера">
            <div className="grid w-full gap-3">
              <FormField name="ds-name" label="Название" placeholder="Например, Сайт" />
              <FormField
                name="ds-key"
                label="Ключ"
                defaultValue="??"
                errors={['Только латиница']}
              />
            </div>
          </DsSample>
          <DsSample label="Textarea, Checkbox, Switch">
            <div className="grid w-full gap-3">
              <Textarea aria-label="Описание" placeholder="Описание задачи" />
              <div className="flex flex-wrap items-center gap-6">
                <span className="flex items-center gap-2">
                  <Checkbox id="ds-watch" defaultChecked />
                  <Label htmlFor="ds-watch" className="font-normal">
                    Наблюдать
                  </Label>
                </span>
                <span className="flex items-center gap-2">
                  <Switch id="ds-email" defaultChecked />
                  <Label htmlFor="ds-email" className="font-normal">
                    Письмом
                  </Label>
                </span>
              </div>
            </div>
          </DsSample>
          <DsSample
            label="Tabs"
            hint="Переключение видов внутри блока; навигация между страницами — TabLink"
          >
            <Tabs defaultValue="write">
              <TabsList>
                <TabsTrigger value="write">Текст</TabsTrigger>
                <TabsTrigger value="preview">Просмотр</TabsTrigger>
              </TabsList>
              <TabsContent value="write" className="text-sm text-muted-foreground">
                Вкладка «Текст»
              </TabsContent>
              <TabsContent value="preview" className="text-sm text-muted-foreground">
                Вкладка «Просмотр»
              </TabsContent>
            </Tabs>
          </DsSample>
        </div>
      </DsSection>

      <DsSection
        id="statuses"
        title="Статусы и тона"
        description={
          <>
            Цвет выбирается тоном (<DsCode>design-system/tones.ts</DsCode>): семантика — success,
            warning, info, destructive; палитра статусов — шесть тонов.
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <DsSample label="ToneBadge: семантика">
            <ToneBadge tone="neutral">Черновик</ToneBadge>
            <ToneBadge tone="info">Подсказка</ToneBadge>
            <ToneBadge tone="success">Подключено</ToneBadge>
            <ToneBadge tone="warning">Через администратора</ToneBadge>
            <ToneBadge tone="destructive">Заблокирован</ToneBadge>
          </DsSample>
          <DsSample label="Цвета статусов и меток" hint="StatusDot · StatusCount · ToneBadge">
            {STATUS_COLORS.map((color) => (
              <span key={color} className="inline-flex items-center gap-1.5 text-xs">
                <StatusDot color={color} />
                {STATUS_COLOR_LABELS[color]}
                <StatusCount color={color} count={3} />
              </span>
            ))}
          </DsSample>
          <DsSample label="Приоритет" hint="Высокий — warning, срочный — destructive">
            {TASK_PRIORITIES.map((priority) => (
              <PriorityBadge key={priority} priority={priority} />
            ))}
          </DsSample>
          <DsSample label="GitHub: PR, ревью, CI">
            <PrStateBadge state="open" />
            <PrStateBadge state="draft" />
            <PrStateBadge state="merged" />
            <PrStateBadge state="closed" />
            <ReviewBadge state="approved" />
            <ReviewBadge state="changes_requested" />
            <ChecksIndicator state="pending" />
            <ChecksIndicator state="success" />
            <ChecksIndicator state="failure" />
          </DsSample>
          <DsSample label="Бейджи" hint="Badge (роли) · TagBadge · AudienceBadges · ViaAgentBadge">
            <Badge>Владелец</Badge>
            <Badge variant="secondary">Участник</Badge>
            <Badge variant="outline">Управляет проектами</Badge>
            <TagBadge name="Договоры" color="violet" />
            <AudienceBadges audience={['member', 'owner']} />
            <ViaAgentBadge via={{ tokenName: 'Ноутбук' }} />
          </DsSample>
          <DsSample label="Точки тонов" hint="ToneDot · ToneDot strong">
            {STATUS_COLORS.map((color) => (
              <ToneDot key={color} tone={color} className="size-3" />
            ))}
            {STATUS_COLORS.map((color) => (
              <ToneDot key={`${color}-strong`} tone={color} strong className="size-3" />
            ))}
          </DsSample>
        </div>
      </DsSection>

      <DsSection id="feedback" title="Обратная связь">
        <div className="grid gap-3 md:grid-cols-2">
          <Callout tone="info" title="Подсказка">
            Ключ задач меняется только до первой задачи.
          </Callout>
          <Callout tone="success">GitHub App создан. Можно подключать репозитории.</Callout>
          <Callout tone="warning">Приложение будет создано без вебхука.</Callout>
          <Callout
            tone="destructive"
            title="Заметку изменили, пока вы её редактировали"
            action={
              <Button size="sm" variant="outline">
                Загрузить актуальную версию
              </Button>
            }
          >
            Сохранение перезаписало бы чужие правки.
          </Callout>
          <EmptyState
            icon={InboxIcon}
            title="Здесь пока пусто"
            description="Создайте первую задачу — она появится здесь."
            action={<Button size="sm">Создать задачу</Button>}
          />
          <div className="grid content-start gap-3">
            <EmptyState variant="compact" title="Активных сессий нет." />
            <div className="grid gap-2 rounded-xl border bg-card p-4" aria-hidden>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
            <div className="flex flex-wrap gap-2">
              <ToastDemo />
            </div>
          </div>
        </div>
      </DsSection>

      <DsSection id="composite" title="Составные компоненты">
        <div className="grid gap-3 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-2 rounded-xl bg-muted/60 p-2">
            {DEMO_CARDS.map((card) => (
              <TaskCard
                key={card.taskId}
                card={card}
                href="#composite"
                pullRequest={card.number === 42 ? { state: 'open', count: 1 } : undefined}
              />
            ))}
          </div>
          <div className="grid content-start gap-3">
            <DsSample label="UserAvatar" hint="xs · sm · md · lg; фото или инициалы">
              {DEMO_USERS.map((user) => (
                <UserAvatar key={user.name} user={user} size="md" />
              ))}
              <UserAvatar user={DEMO_USERS[0]} size="xs" />
              <UserAvatar user={DEMO_USERS[1]} size="sm" />
              <UserAvatar user={DEMO_USERS[0]} size="lg" />
            </DsSample>
            <DsSample
              label="EntityIconTile"
              hint="Иконки пространств и проектов — декоративная палитра, исключение из правила тонов"
            >
              {ENTITY_ICONS.map((icon) => (
                <EntityIconTile key={icon} icon={icon} />
              ))}
            </DsSample>
          </div>
        </div>
      </DsSection>
    </div>
  );
}
