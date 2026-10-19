import { Button } from '@/components/ui/button';

/** Кнопка сохранения группы настроек и отметка «Сохранено». */
export function SettingsSaveRow({ pending, saved }: { pending: boolean; saved: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Сохранить'}
      </Button>
      {saved && (
        <span role="status" className="text-sm text-muted-foreground">
          Сохранено. Другие процессы приложения применят изменения в течение 30 секунд.
        </span>
      )}
    </div>
  );
}
