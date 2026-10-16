import { BotIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Пометка «через Claude Code»: человек создал задачу, комментарий или документ через агента
 * по личному токену. В подсказке — название токена. Без хуков: годится и для серверных страниц.
 */
export function ViaAgentBadge({
  via,
  className,
}: {
  via: { tokenName: string } | null;
  className?: string;
}) {
  if (!via) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground',
        className,
      )}
      title={`Через агента, токен «${via.tokenName}»`}
    >
      <BotIcon aria-hidden className="size-3" />
      через Claude Code
      <span className="sr-only">, токен «{via.tokenName}»</span>
    </span>
  );
}
