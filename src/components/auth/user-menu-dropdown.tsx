'use client';

import { LogOutIcon, ShieldIcon } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';

import { initials } from '@/components/layout/initials';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const THEME_OPTIONS = [
  { value: 'system', label: 'Как в системе' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
] as const;

interface UserMenuDropdownProps {
  name: string;
  email: string;
  isAdmin: boolean;
  signOutAction: () => Promise<void>;
}

/** Аватар с выпадающим меню: профиль, админка (только администратору), тема, выход. */
export function UserMenuDropdown({ name, email, isAdmin, signOutAction }: UserMenuDropdownProps) {
  // До гидратации тема неизвестна (undefined) — ни один пункт не отмечен.
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Меню пользователя"
        className="grid size-8 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-primary/15"
      >
        {initials(name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="truncate font-medium text-foreground">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
          {isAdmin && (
            <Badge variant="secondary" className="mt-1.5 justify-self-start">
              Администратор
            </Badge>
          )}
        </DropdownMenuLabel>
        {/* Ссылка скрыта для не-админов ради UX; доступ проверяет сама страница /admin. */}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldIcon />
                Администрирование
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Тема</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon />
              Выйти
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
