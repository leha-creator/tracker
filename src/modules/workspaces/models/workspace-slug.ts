import { ValidationError } from '@/shared/errors/app-error';
import { transliterate } from '@/shared/text';

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 48;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Служебные сегменты URL, которые не могут быть slug пространства. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'new',
  'settings',
  'api',
  'admin',
  'invite',
  'login',
  'register',
  'workspaces',
]);

/** Slug из названия: транслитерация кириллицы, `a-z0-9` и дефисы. Может вернуть пустую строку. */
export function slugify(name: string): string {
  return transliterate(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/** Описание ошибки slug или null, если slug допустим. Используется и в Zod-схеме формы. */
export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return `Адрес — от ${SLUG_MIN_LENGTH} до ${SLUG_MAX_LENGTH} символов`;
  }
  if (!SLUG_PATTERN.test(slug)) {
    return 'Только латинские буквы, цифры и дефисы между ними';
  }
  if (RESERVED_SLUGS.has(slug)) return 'Этот адрес зарезервирован';
  return null;
}

export function validateSlug(slug: string): string {
  const problem = slugProblem(slug);
  if (problem) throw new ValidationError(problem, { fieldErrors: { slug: [problem] } });
  return slug;
}

/** Slug для нового пространства: заданный пользователем или сгенерированный из названия. */
export function resolveSlug(name: string, requested?: string): string {
  if (requested) return validateSlug(requested);
  const generated = slugify(name);
  if (slugProblem(generated)) {
    throw new ValidationError('Не удалось составить адрес из названия — укажите его вручную', {
      fieldErrors: { slug: ['Укажите адрес пространства'] },
    });
  }
  return generated;
}
