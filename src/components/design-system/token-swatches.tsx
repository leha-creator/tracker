'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

import { COLOR_TOKENS, TOKEN_GROUP_LABELS, type TokenGroup } from './token-catalog';

const GROUPS = Object.keys(TOKEN_GROUP_LABELS) as TokenGroup[];

/** Образцы цветов из каталога токенов с текущими значениями в активной теме. */
export function TokenSwatches() {
  const { resolvedTheme } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    // Значения читаются в следующем кадре после смены темы: класс .dark уже применён к <html>.
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      setValues(
        Object.fromEntries(
          COLOR_TOKENS.map((token) => [
            token.name,
            style.getPropertyValue(`--${token.name}`).trim(),
          ]),
        ),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return (
    <div className="grid gap-6">
      {GROUPS.filter((group) => COLOR_TOKENS.some((token) => token.group === group)).map(
        (group) => (
          <div key={group} className="grid gap-2">
            <h3 className="text-sm font-semibold">{TOKEN_GROUP_LABELS[group]}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {COLOR_TOKENS.filter((token) => token.group === group).map((token) => (
                <li key={token.name} className="flex min-w-0 gap-3 rounded-xl border bg-card p-2.5">
                  <span
                    aria-hidden
                    className={cn('size-10 shrink-0 rounded-lg border')}
                    style={{ background: `var(--${token.name})` }}
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm font-medium">{token.label}</span>
                    <code className="truncate font-mono text-2xs text-muted-foreground">
                      --{token.name}
                    </code>
                    <span className="text-xs text-muted-foreground">{token.usage}</span>
                    {values[token.name] ? (
                      <code className="truncate font-mono text-2xs text-muted-foreground/80">
                        {values[token.name]}
                      </code>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}
