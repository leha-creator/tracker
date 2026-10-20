import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { TONE_SOFT, TONE_TEXT } from '@/components/design-system/tones';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export type CalloutTone = 'info' | 'success' | 'warning' | 'destructive';

const ICONS: Record<CalloutTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleAlert,
};

interface CalloutProps {
  tone: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Своя иконка; null — без иконки. */
  icon?: LucideIcon | null;
  /** Действие справа (кнопка). */
  action?: ReactNode;
  /**
   * note — статичный блок; status — результат действия (скринридер прочитает);
   * alert — срочное: действие пользователя заблокировано (конфликт правок).
   */
  role?: 'note' | 'status' | 'alert';
  className?: string;
}

/**
 * Блок-сообщение внутри страницы: подсказка, успех, предупреждение, ошибка.
 * Статичный блок (role="note"). Ошибки, появляющиеся после действия, показывают FormError или toast.
 */
export function Callout({
  tone,
  title,
  children,
  icon,
  action,
  role = 'note',
  className,
}: CalloutProps) {
  const Icon = icon === null ? null : (icon ?? ICONS[tone]);
  return (
    <Alert role={role} className={cn('px-3 py-2.5', TONE_SOFT[tone], className)}>
      {Icon ? <Icon aria-hidden className={TONE_TEXT[tone]} /> : null}
      {title ? <AlertTitle className="text-foreground">{title}</AlertTitle> : null}
      {children ? (
        <AlertDescription className="text-foreground/80">{children}</AlertDescription>
      ) : null}
      {action ? <div className="col-span-full mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </Alert>
  );
}
