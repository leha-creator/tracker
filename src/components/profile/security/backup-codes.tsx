'use client';

import { CopyIcon, DownloadIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { formatBackupCodesFile } from '@/modules/auth/client';

/** Резервные коды: показываются один раз — копирование и скачивание файлом. */
export function BackupCodes({ codes, email }: { codes: string[]; email: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      toast.success('Коды скопированы');
    } catch {
      toast.error('Не удалось скопировать — сохраните коды файлом');
    }
  }

  function download() {
    const blob = new Blob([formatBackupCodesFile(codes, email, new Date())], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tasker-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-3">
      <ul
        aria-label="Резервные коды"
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-muted px-4 py-3 font-mono text-sm"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          <CopyIcon aria-hidden />
          Копировать
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <DownloadIcon aria-hidden />
          Скачать .txt
        </Button>
      </div>
    </div>
  );
}
