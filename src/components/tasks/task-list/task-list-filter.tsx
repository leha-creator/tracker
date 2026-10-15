'use client';

import { ChevronDownIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Отделить чертой от следующих (специальные значения: «Я», «Не назначен»). */
  separatorAfter?: boolean;
}

interface TaskListFilterProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

/** Фильтр с множественным выбором: меню с галочками, на кнопке — число выбранных. */
export function TaskListFilter({ label, options, selected, onChange }: TaskListFilterProps) {
  const count = selected.length;

  function toggle(value: string, checked: boolean) {
    // Порядок значений — как в меню: URL не зависит от порядка кликов.
    const next = new Set(selected);
    if (checked) next.add(value);
    else next.delete(value);
    onChange(options.map((option) => option.value).filter((item) => next.has(item)));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(count > 0 && 'border-primary/50 bg-primary/5')}
          aria-label={count > 0 ? `${label}: выбрано ${count}` : label}
        >
          {label}
          {count > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
              {count}
            </span>
          )}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-52 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Нет вариантов</p>
        )}
        {options.map((option) => (
          <Fragment key={option.value}>
            <DropdownMenuCheckboxItem
              checked={selected.includes(option.value)}
              onCheckedChange={(checked) => toggle(option.value, checked)}
              // Меню не закрывается: можно отметить несколько значений подряд.
              onSelect={(event) => event.preventDefault()}
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
            </DropdownMenuCheckboxItem>
            {option.separatorAfter && <DropdownMenuSeparator />}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
