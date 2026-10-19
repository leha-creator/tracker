import { vi } from 'vitest';

import type * as AuditModule from '@/shared/audit';

// Журнал действий в тестах модулей не пишет в БД: recordAuditEvent — шпион, остальное — настоящее.
// Тест может проверить запись: vi.mocked(recordAuditEvent) из '@/shared/audit'.
// Собственные тесты src/shared/audit импортируют файлы напрямую и мок не затрагивает.
vi.mock('@/shared/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof AuditModule>();
  return { ...actual, recordAuditEvent: vi.fn(() => Promise.resolve()) };
});
