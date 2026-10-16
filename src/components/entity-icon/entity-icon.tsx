import {
  BookOpen,
  Briefcase,
  Camera,
  CodeXml,
  House,
  Monitor,
  Music,
  Palette,
  Rocket,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { EntityIcon } from '@/shared/entity-icon';

// Полные имена классов: Tailwind находит их в исходниках. У каждой иконки свой цвет заливки.
const ICONS: Record<EntityIcon, { Icon: LucideIcon; fill: string }> = {
  briefcase: { Icon: Briefcase, fill: 'bg-amber-500' },
  monitor: { Icon: Monitor, fill: 'bg-sky-500' },
  camera: { Icon: Camera, fill: 'bg-rose-500' },
  rocket: { Icon: Rocket, fill: 'bg-violet-500' },
  palette: { Icon: Palette, fill: 'bg-fuchsia-500' },
  book: { Icon: BookOpen, fill: 'bg-emerald-500' },
  cart: { Icon: ShoppingCart, fill: 'bg-orange-500' },
  code: { Icon: CodeXml, fill: 'bg-slate-600' },
  home: { Icon: House, fill: 'bg-lime-600' },
  music: { Icon: Music, fill: 'bg-indigo-500' },
};

const SIZES = {
  sm: { tile: 'size-5 rounded-[0.3rem]', icon: 'size-3' },
  md: { tile: 'size-9 rounded-lg', icon: 'size-[1.125rem]' },
  lg: { tile: 'size-10 rounded-lg', icon: 'size-5' },
  xl: { tile: 'size-12 rounded-xl', icon: 'size-6' },
} as const;

interface EntityIconTileProps {
  icon: EntityIcon;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Иконка пространства или проекта: белый значок на цветной плитке. Декоративная. */
export function EntityIconTile({ icon, size = 'md', className }: EntityIconTileProps) {
  const { Icon, fill } = ICONS[icon];
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-white shadow-xs',
        fill,
        SIZES[size].tile,
        className,
      )}
    >
      <Icon className={SIZES[size].icon} strokeWidth={2.25} />
    </span>
  );
}
