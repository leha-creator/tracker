// Настройки ресурса (одна строка ResourceSettings): группа «Хранилище» (квота пространства по
// умолчанию) — ./storage-settings. Задаёт администратор (модуль admin), применяет documents.
// Регистрацию решает IdP plwedding ID: своей политики регистрации у tasker нет.
export { loadResourceSettings } from './settings-store';
export type { ResourceSettingsRow } from './settings-store';
export { getStorageSettings, saveStorageSettings } from './storage-settings';
export type { StorageSettings } from './storage-settings';
