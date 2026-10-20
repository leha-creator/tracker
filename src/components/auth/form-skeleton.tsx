import { Skeleton } from '@/components/ui/skeleton';

/** Заглушка формы на время чтения сессии (без полей, чтобы не дублировать id в DOM). */
export function FormSkeleton({ fields }: { fields: number }) {
  return (
    <div className="grid gap-4" aria-busy="true">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className="h-4 w-24 rounded-sm" />
          <Skeleton className="h-9" />
        </div>
      ))}
      <Skeleton className="h-9" />
    </div>
  );
}
