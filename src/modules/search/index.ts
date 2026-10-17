// Публичный API модуля для серверного кода. Клиентским компонентам — './client'.
// Модуль-агрегатор палитры Cmd+K: search → tasks, documents, workspaces (через их index.ts);
// от search не зависит никто.
export * from './client';

export { globalSearch } from './slices/global/global.service';
