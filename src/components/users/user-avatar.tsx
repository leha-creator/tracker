import { initials } from '@/components/layout/initials';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { isAvatarUrl } from '@/modules/profiles/client';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-xl',
  xl: 'size-24 text-3xl',
} as const;

export type UserAvatarSize = keyof typeof SIZES;

interface UserAvatarProps {
  user: { name: string; image: string | null };
  size?: UserAvatarSize;
  className?: string;
  /** Подпись для скринридера; без неё аватар декоративный (имя обычно рядом текстом). */
  label?: string;
}

/**
 * Фото пользователя; пока не загрузилось или его нет — инициалы. Показываются только адреса фото,
 * выданные приложением (`isAvatarUrl`): внешний адрес в User.image не загружается.
 */
export function UserAvatar({ user, size = 'xs', className, label }: UserAvatarProps) {
  return (
    <Avatar
      className={cn(SIZES[size], className)}
      title={label ? undefined : user.name}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
    >
      {isAvatarUrl(user.image) && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback className="bg-primary/10 text-[length:inherit] font-semibold text-primary">
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}
