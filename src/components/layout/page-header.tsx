import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const TITLE_OVERFLOW = {
  /** Длинное название переносится (пользовательские названия). */
  wrap: 'break-words',
  /** Одна строка с многоточием (заголовок рядом с плиткой или действиями). */
  truncate: 'truncate',
  /** На мобильных переносится, на sm+ — одна строка. */
  'wrap-mobile-truncate': 'break-words sm:truncate',
} as const;

interface PageHeaderProps {
  title: ReactNode;
  /** id заголовка — для aria-labelledby раздела страницы. */
  id?: string;
  description?: ReactNode;
  /** Кнопки справа; на узком экране переносятся под заголовок. */
  actions?: ReactNode;
  /** Слева от заголовка: аватар, плитка иконки. */
  leading?: ReactNode;
  /** Сразу после текста заголовка, в той же строке: бейджи («Агент», «вы»). */
  titleAddon?: ReactNode;
  /** Под заголовком и описанием: теги, бейджи, метаданные. */
  meta?: ReactNode;
  overflow?: keyof typeof TITLE_OVERFLOW;
  /** Выравнивание заголовка и действий по вертикали. */
  align?: 'center' | 'start';
  as?: 'div' | 'header';
  className?: string;
}

/** Заголовок страницы: единственный h1, описание, действия. Все h1 приложения — через него. */
export function PageHeader({
  title,
  id,
  description,
  actions,
  leading,
  titleAddon,
  meta,
  overflow = 'wrap',
  align = 'center',
  as: Comp = 'div',
  className,
}: PageHeaderProps) {
  return (
    <Comp
      className={cn(
        'flex flex-wrap justify-between gap-3',
        align === 'center' ? 'items-center' : 'items-start',
        className,
      )}
    >
      <div className={cn('flex min-w-0 flex-1 gap-3', leading ? 'items-center' : undefined)}>
        {leading}
        <div className="grid min-w-0 flex-1 gap-1">
          <h1
            id={id}
            className={cn(
              'min-w-0 text-2xl leading-8 font-semibold tracking-tight',
              titleAddon ? 'flex flex-wrap items-center gap-x-2 gap-y-1' : TITLE_OVERFLOW[overflow],
            )}
          >
            {titleAddon ? <span className={TITLE_OVERFLOW[overflow]}>{title}</span> : title}
            {titleAddon}
          </h1>
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
          {meta}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </Comp>
  );
}

const SECTION_SIZES = {
  /** Раздел страницы. */
  section: 'text-lg font-semibold',
  /** Группа внутри карточки, панели или секции настроек. */
  group: 'text-base font-semibold',
} as const;

interface SectionHeadingProps {
  title: ReactNode;
  id?: string;
  size?: keyof typeof SECTION_SIZES;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}

/** Заголовок раздела (h2/h3) с необязательным описанием и действиями справа. */
export function SectionHeading({
  title,
  id,
  size = 'section',
  description,
  actions,
  as: Heading = 'h2',
  className,
}: SectionHeadingProps) {
  if (!description && !actions) {
    return (
      <Heading id={id} className={cn('min-w-0 break-words', SECTION_SIZES[size], className)}>
        {title}
      </Heading>
    );
  }
  const heading = (
    <Heading id={id} className={cn('min-w-0 break-words', SECTION_SIZES[size])}>
      {title}
    </Heading>
  );
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="grid min-w-0 gap-1">
        {heading}
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
