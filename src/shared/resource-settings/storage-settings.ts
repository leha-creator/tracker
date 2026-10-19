import 'server-only';

import { loadResourceSettings, readSettingsRow, writeSettingsFields } from './settings-store';

// Группа «Хранилище» настроек ресурса: квота пространства по умолчанию. Остаётся в tasker.

export interface StorageSettings {
  /** МБ; null — DOCUMENTS_WORKSPACE_QUOTA_MB. */
  defaultWorkspaceQuotaMb: number | null;
}

export async function getStorageSettings(): Promise<StorageSettings> {
  const { defaultWorkspaceQuotaMb } = await loadResourceSettings();
  return { defaultWorkspaceQuotaMb };
}

/** Сохраняет настройки хранилища. Возвращает изменённые поля с новыми значениями — для журнала. */
export async function saveStorageSettings(
  input: StorageSettings,
  actorId: string,
): Promise<Partial<Record<keyof StorageSettings, string>>> {
  const previous = await readSettingsRow();
  await writeSettingsFields(input, actorId, 'storage');
  if (previous.defaultWorkspaceQuotaMb === input.defaultWorkspaceQuotaMb) return {};
  return {
    defaultWorkspaceQuotaMb:
      input.defaultWorkspaceQuotaMb === null ? '—' : String(input.defaultWorkspaceQuotaMb),
  };
}
