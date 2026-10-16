'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABELS,
  STATUS_COLOR_LABELS,
  STATUS_COLORS,
  type StatusCategory,
  type StatusColor,
} from '@/modules/projects/client';

import { StatusDot } from './status-badge';

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  /** Классы триггера; по умолчанию фиксированная ширина. */
  className?: string;
}

/** Выбор категории; значение уходит в форму полем `category`. */
export function CategorySelect({
  value,
  onChange,
  label,
  disabled,
  className,
}: SelectProps<StatusCategory>) {
  return (
    <Select
      name="category"
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as StatusCategory)}
    >
      <SelectTrigger size="sm" aria-label={label} className={cn('w-36', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_CATEGORIES.map((category) => (
          <SelectItem key={category} value={category}>
            {STATUS_CATEGORY_LABELS[category]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Выбор цвета из палитры; значение уходит в форму полем `color`. */
export function ColorSelect({
  value,
  onChange,
  label,
  disabled,
  className,
}: SelectProps<StatusColor>) {
  return (
    <Select
      name="color"
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as StatusColor)}
    >
      <SelectTrigger size="sm" aria-label={label} className={cn('w-36', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_COLORS.map((color) => (
          <SelectItem key={color} value={color}>
            <StatusDot color={color} />
            {STATUS_COLOR_LABELS[color]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
