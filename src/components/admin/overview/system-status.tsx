import { CheckCircle2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ResourceOverviewDto, StorageTotalsDto } from '@/modules/admin/client';
import { formatBytes } from '@/modules/documents/client';

import { TestMailButton } from './test-mail-button';

const CARD_CLASS = 'grid content-start gap-3 rounded-xl border bg-card p-4';

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span
        className={cn(
          'flex items-center gap-1.5',
          ok ? 'text-muted-foreground' : 'text-destructive',
        )}
      >
        <Icon aria-hidden className="size-4" />
        {ok ? 'Работает' : 'Недоступно'}
      </span>
    </li>
  );
}

function StorageRow({ label, usage }: { label: string; usage: StorageTotalsDto }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="text-muted-foreground tabular-nums">
        {formatBytes(usage.usedBytes)} · файлов: {usage.filesCount}
      </span>
    </li>
  );
}

/** Состояние инфраструктуры, хранилище и проверка почты. */
export function SystemStatus({ overview }: { overview: ResourceOverviewDto }) {
  const { documents, attachments } = overview.storage;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className={CARD_CLASS}>
        <h2 className="text-base font-medium">Состояние</h2>
        <ul className="grid gap-2">
          <StatusRow label="База данных" ok={overview.health.db} />
          <StatusRow label="Хранилище файлов" ok={overview.health.storage} />
        </ul>
      </section>
      <section className={CARD_CLASS}>
        <h2 className="text-base font-medium">Хранилище</h2>
        <ul className="grid gap-2">
          <StorageRow label="Документы" usage={documents} />
          <StorageRow label="Вложения задач" usage={attachments} />
          <StorageRow
            label="Всего"
            usage={{
              usedBytes: documents.usedBytes + attachments.usedBytes,
              filesCount: documents.filesCount + attachments.filesCount,
            }}
          />
        </ul>
      </section>
      <section className={CARD_CLASS}>
        <h2 className="text-base font-medium">Почта</h2>
        <p className="text-sm text-muted-foreground">
          Письмо уйдёт на ваш адрес {overview.adminEmail}. Не больше 10 писем в час.
        </p>
        <TestMailButton />
      </section>
    </div>
  );
}
