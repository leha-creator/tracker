import { STATUS_CATEGORIES, type StatusCategory } from '@/modules/projects/client';
import { ValidationError } from '@/shared/errors';

/** Проект пространства со статусами по порядку колонок. */
export interface CatalogProject {
  id: string;
  name: string;
  statuses: CatalogStatus[];
}

export interface CatalogStatus {
  id: string;
  name: string;
  category: StatusCategory;
  position: number;
}

export interface CatalogMember {
  userId: string;
  name: string;
  email: string;
  /** Агент пространства: служебный email не показываем. */
  isAgent?: boolean;
}

/** Без регистра, лишних пробелов и различия «ё/е». */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е');
}

const CATEGORY_ALIASES: Record<string, StatusCategory> = {
  todo: 'todo',
  'to do': 'todo',
  in_progress: 'in_progress',
  'in progress': 'in_progress',
  'in-progress': 'in_progress',
  done: 'done',
};

/** `todo` / `in_progress` / `done` (и написания `in progress`, `in-progress`) или null. */
export function parseStatusCategory(value: string): StatusCategory | null {
  return CATEGORY_ALIASES[normalizeName(value)] ?? null;
}

function quoteList(names: readonly string[]): string {
  return names.map((name) => `«${name}»`).join(', ');
}

/** Единственный элемент по id или имени; иначе — ошибка со списком вариантов для агента. */
export function pickByIdOrName<T extends { id: string; name: string }>(
  items: readonly T[],
  ref: string,
  what: { one: string; options: string },
): T {
  const byId = items.find((item) => item.id === ref.trim());
  if (byId) return byId;
  const wanted = normalizeName(ref);
  const matches = items.filter((item) => normalizeName(item.name) === wanted);
  if (matches.length === 1) return matches[0]!;
  const options = quoteList(items.map((item) => item.name)) || 'нет';
  if (matches.length > 1) {
    throw new ValidationError(
      `${what.one} «${ref}» неоднозначен — укажите id. Варианты: ${options}`,
    );
  }
  throw new ValidationError(`${what.one} «${ref}» не найден. ${what.options}: ${options}`);
}

export function resolveProject(projects: readonly CatalogProject[], ref: string): CatalogProject {
  return pickByIdOrName(projects, ref, { one: 'Проект', options: 'Проекты' });
}

/**
 * Статус проекта по id, имени или категории. Для категории берётся первый по порядку статус
 * этой категории — так агент может сказать «in_progress», не зная названий колонок.
 */
export function resolveStatus(project: CatalogProject, ref: string): CatalogStatus {
  const byName = project.statuses.filter(
    (status) => status.id === ref.trim() || normalizeName(status.name) === normalizeName(ref),
  );
  if (byName.length === 1) return byName[0]!;

  const category = parseStatusCategory(ref);
  if (category && byName.length === 0) {
    const first = [...project.statuses]
      .sort((a, b) => a.position - b.position)
      .find((status) => status.category === category);
    if (first) return first;
    throw new ValidationError(
      `В проекте «${project.name}» нет статусов категории ${category}. Статусы: ${quoteList(
        project.statuses.map((status) => status.name),
      )}`,
    );
  }
  return pickByIdOrName(project.statuses, ref, {
    one: `Статус проекта «${project.name}»`,
    options: `Статусы (или категория: ${STATUS_CATEGORIES.join(', ')})`,
  });
}

/**
 * Ответственный: `me`, id участника, email или имя участника пространства.
 * Не участник — ошибка (сервис тоже проверит, но агенту полезнее список).
 */
export function resolveMember(
  members: readonly CatalogMember[],
  ref: string,
  currentUserId: string,
): CatalogMember {
  const value = ref.trim();
  if (value.toLowerCase() === 'me') {
    const me = members.find((member) => member.userId === currentUserId);
    if (me) return me;
  }
  const byIdOrEmail = members.find(
    (member) => member.userId === value || member.email.toLowerCase() === value.toLowerCase(),
  );
  if (byIdOrEmail) return byIdOrEmail;

  const matches = members.filter((member) => normalizeName(member.name) === normalizeName(value));
  if (matches.length === 1) return matches[0]!;
  const options = members.map((member) => `${member.name} <${member.email}>`).join(', ');
  if (matches.length > 1) {
    throw new ValidationError(`Участников с именем «${ref}» несколько — укажите email: ${options}`);
  }
  throw new ValidationError(`Участник «${ref}» не найден. Участники: ${options}`);
}

/** Метка пространства для фильтров и правки задачи. */
export interface CatalogLabel {
  id: string;
  name: string;
}

/**
 * Имена меток от агента: без пустых, повторы (без учёта регистра, пробелов и «ё/е») убраны,
 * остаётся первое написание.
 */
export function uniqueLabelNames(names: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeName(name);
    if (key && !byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.values()];
}

/** Метки для фильтра по id или имени; неизвестная — ошибка со списком меток. */
export function resolveLabels(
  labels: readonly CatalogLabel[],
  refs: readonly string[],
): CatalogLabel[] {
  const picked = new Map<string, CatalogLabel>();
  for (const ref of uniqueLabelNames(refs)) {
    const label = pickByIdOrName(labels, ref, { one: 'Метка', options: 'Метки' });
    picked.set(label.id, label);
  }
  return [...picked.values()];
}
