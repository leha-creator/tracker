import { Progress } from '@/components/ui/progress';
import { formatBytes, type StorageUsageDto } from '@/modules/documents/client';

/** «Занято 120 МБ из 1 ГБ» — хранилище файлов пространства. */
export function StorageUsage({ usage }: { usage: StorageUsageDto }) {
  const percent =
    usage.quotaBytes > 0 ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100) : 0;
  const label = `Занято ${formatBytes(usage.usedBytes)} из ${formatBytes(usage.quotaBytes)}`;
  return (
    <div className="grid gap-1.5">
      <Progress
        value={percent}
        aria-label="Место в хранилище пространства"
        aria-valuetext={label}
        className={percent >= 90 ? '[&>[data-slot=progress-indicator]]:bg-destructive' : undefined}
      />
      <p className="text-xs text-muted-foreground tabular-nums">
        {label}
        {usage.filesCount > 0 && ` · файлов: ${usage.filesCount}`}
      </p>
    </div>
  );
}
