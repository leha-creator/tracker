import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Кнопка или ссылка действия под текстом. */
  action?: ReactNode;
  /**
   * default — блок раздела страницы (иконка, заголовок, текст, действие);
   * compact — одна строка в рамке внутри карточки или таблицы.
   */
  variant?: 'default' | 'compact';
  className?: string;
}

/** Пустое состояние: «здесь пока ничего нет» и что с этим сделать. */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  variant = 'default',
  className,
}: EmptyStateProps) {
  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        <p>{title}</p>
        {description ? <p className="mt-1 text-xs">{description}</p> : null}
        {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid justify-items-center gap-3 rounded-xl border border-dashed p-8 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <div className="grid max-w-md gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
