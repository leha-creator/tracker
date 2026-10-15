/**
 * Нарушение уникального индекса (Prisma P2002). Проверка по коду, без instanceof: через
 * driver adapter ошибка приходит из runtime Prisma, а в тестах — простым объектом.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/** Нарушение внешнего ключа (Prisma P2003): связанную строку удалили параллельно. */
export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003';
}
