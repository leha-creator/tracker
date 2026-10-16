import { CopyLinkButton } from '@/components/workspaces/copy-link-button';

/** Готовый к копированию фрагмент: команда, конфиг или токен. */
export function CodeSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <CopyLinkButton url={value} label="Скопировать" />
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre select-all">
        {value}
      </pre>
    </div>
  );
}
