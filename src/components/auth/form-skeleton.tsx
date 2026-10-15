/** Заглушка формы на время чтения сессии (без полей, чтобы не дублировать id в DOM). */
export function FormSkeleton({ fields }: { fields: number }) {
  return (
    <div className="grid gap-4" aria-busy="true">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="grid gap-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
        </div>
      ))}
      <div className="h-9 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
