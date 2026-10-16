import { UserAvatar } from '@/components/users/user-avatar';
import type { TaskUserDto } from '@/modules/tasks/client';

/** Фото ответственного (или инициалы) с подписью для скринридера. */
export function AssigneeAvatar({ user, className }: { user: TaskUserDto; className?: string }) {
  return <UserAvatar user={user} className={className} label={`Ответственный: ${user.name}`} />;
}
