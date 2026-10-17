import { barPercent } from '@/modules/tasks/client';

/**
 * Полоса «открытые задачи»: одна серия, один тон, общая шкала (`max`) для всех строк блока.
 * Число — текстом рядом, поэтому полоса декоративна для скринридера.
 */
export function CountBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = barPercent(value, max);
  return (
    <div className="flex min-w-0 items-center gap-2" title={label}>
      <div aria-hidden className="h-2 min-w-12 flex-1 overflow-hidden">
        {percent > 0 && (
          <div className="h-full rounded-r-[4px] bg-primary/80" style={{ width: `${percent}%` }} />
        )}
      </div>
      <span className="w-8 shrink-0 text-right text-sm tabular-nums">{value}</span>
    </div>
  );
}
