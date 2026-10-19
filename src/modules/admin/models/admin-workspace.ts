import { ValidationError } from '@/shared/errors/app-error';

/** Квота хранилища пространства, МБ: 0 закрывает загрузку файлов. */
export const WORKSPACE_QUOTA_MIN_MB = 0;
export const WORKSPACE_QUOTA_MAX_MB = 1_000_000;

/** Удаление навсегда подтверждается точным названием (как у владельца пространства). */
export function assertWorkspaceNameConfirmed(name: string, confirmName: string): void {
  if (confirmName.trim() !== name) {
    throw new ValidationError('Название не совпадает', {
      fieldErrors: { confirmName: ['Введите название пространства точно'] },
    });
  }
}
