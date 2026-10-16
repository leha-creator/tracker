import Link from 'next/link';

import { StatusDot } from '@/components/projects/status-badge';
import { cn } from '@/lib/utils';
import type { DocumentTagColor } from '@/modules/documents/client';

interface TagBadgeProps {
  name: string;
  color: DocumentTagColor;
  /** Ссылка на документы с этим тегом. */
  href?: string;
  className?: string;
}

/** Тег документа: цветная точка (общая палитра со статусами) и название. */
export function TagBadge({ name, color, href, className }: TagBadgeProps) {
  const classes = cn(
    'inline-flex max-w-40 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
    href &&
      'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    className,
  );
  const content = (
    <>
      <StatusDot color={color} className="size-2" />
      <span className="truncate">{name}</span>
    </>
  );
  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
