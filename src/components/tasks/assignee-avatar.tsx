import { cn } from '@/lib/utils';
import type { TaskUserDto } from '@/modules/tasks/client';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : name.slice(0, 2)).toUpperCase();
}

/** Инициалы ответственного (без загрузки изображений). */
export function AssigneeAvatar({ user, className }: { user: TaskUserDto; className?: string }) {
  return (
    <span
      title={user.name}
      aria-label={`Ответственный: ${user.name}`}
      className={cn(
        'inline-grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary',
        className,
      )}
    >
      {initials(user.name)}
    </span>
  );
}
