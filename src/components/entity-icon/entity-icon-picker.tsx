import { FormError } from '@/components/forms/form-field';
import { cn } from '@/lib/utils';
import { ENTITY_ICON_LABELS, ENTITY_ICONS, type EntityIcon } from '@/shared/entity-icon';

import { EntityIconTile } from './entity-icon';

interface EntityIconPickerProps {
  /** Имя поля формы (значение — ключ иконки). */
  name?: string;
  defaultValue: EntityIcon;
  errors?: string[];
  /** Классы сетки плиток: по умолчанию 5 в ряд (узкая панель). */
  gridClassName?: string;
}

/** Выбор иконки из предустановленных: радиокнопки в виде цветных плиток. */
export function EntityIconPicker({
  name = 'icon',
  defaultValue,
  errors,
  gridClassName,
}: EntityIconPickerProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm leading-none font-medium">Иконка</legend>
      <div className={cn('grid w-fit grid-cols-5 gap-2.5', gridClassName)}>
        {ENTITY_ICONS.map((icon) => (
          <label key={icon} className="relative cursor-pointer" title={ENTITY_ICON_LABELS[icon]}>
            <input
              type="radio"
              name={name}
              value={icon}
              defaultChecked={icon === defaultValue}
              aria-label={ENTITY_ICON_LABELS[icon]}
              className="peer sr-only"
            />
            <EntityIconTile
              icon={icon}
              className="opacity-70 transition peer-checked:opacity-100 peer-checked:ring-2 peer-checked:ring-ring peer-checked:ring-offset-2 peer-checked:ring-offset-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background hover:opacity-100"
            />
          </label>
        ))}
      </div>
      {errors?.length ? <FormError message={errors[0]} /> : null}
    </fieldset>
  );
}
