import type { DailyCount } from '@/modules/admin/client';

const DAY_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function dayLabel(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/**
 * Регистрации по дням: столбцы одной серии на общей шкале. Значения — в подсказке и в скрытой
 * таблице для скринридера; сами столбцы декоративны.
 */
export function SignupsChart({ series }: { series: DailyCount[] }) {
  const max = Math.max(1, ...series.map((point) => point.count));
  const first = series[0];
  const last = series.at(-1);
  const withSignups = series.filter((point) => point.count > 0);
  return (
    <figure className="grid gap-2">
      <div aria-hidden className="flex h-32 items-end gap-[2px]">
        {series.map((point) => (
          <div
            key={point.day}
            title={`${dayLabel(point.day)}: ${point.count}`}
            className="flex h-full min-w-0 flex-1 items-end"
          >
            <div
              className={
                point.count > 0 ? 'w-full rounded-t-[3px] bg-primary/80' : 'w-full bg-muted'
              }
              style={{ height: point.count > 0 ? `${(point.count / max) * 100}%` : '2px' }}
            />
          </div>
        ))}
      </div>
      {first && last && (
        <figcaption
          aria-hidden
          className="flex justify-between text-xs text-muted-foreground tabular-nums"
        >
          <span>{dayLabel(first.day)}</span>
          <span>максимум {max} в день</span>
          <span>{dayLabel(last.day)}</span>
        </figcaption>
      )}
      {withSignups.length > 0 && (
        <table className="sr-only">
          <caption>Регистрации по дням</caption>
          <tbody>
            {withSignups.map((point) => (
              <tr key={point.day}>
                <th scope="row">{dayLabel(point.day)}</th>
                <td>{point.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
