import 'server-only';

import { createLogger } from '@/shared/logger';
import { deleteObjects } from '@/shared/storage';

const log = createLogger('tasks.attachment');

/**
 * Удаляет объекты вложений после удаления строк. Не бросает исключений: операция пользователя
 * уже выполнена, сбой хранилища оставляет «сирот», которые видны в логах.
 */
export async function deleteStoredObjects(keys: readonly string[], context: object): Promise<void> {
  if (keys.length === 0) return;
  const failed = await deleteObjects(keys);
  if (failed > 0) {
    log.error({ ...context, count: keys.length, failed }, '[attachment] storage cleanup failed');
  }
}
