// Настройки ресурса (одна строка ResourceSettings) — две независимые группы:
// «Регистрация» (режим, разрешённые домены email) — ./signup-settings, переедет в IdP;
// «Хранилище» (квота пространства по умолчанию) — ./storage-settings.
// Задаёт администратор (модуль admin), применяют shared/auth (регистрация) и documents (квота).
// Чистые правила — в ./client.
export * from './client';
export { loadResourceSettings } from './settings-store';
export type { ResourceSettingsRow } from './settings-store';
export { evaluateSignup, getSignupPolicy, saveSignupPolicy } from './signup-settings';
export type { SignupPolicy } from './signup-settings';
export { getStorageSettings, saveStorageSettings } from './storage-settings';
export type { StorageSettings } from './storage-settings';
