// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: tasks → projects, workspaces (через их index.ts); обратных зависимостей нет.
export * from './client';

export { getTaskByNumber } from './slices/task/task.service';
export { getBoardCards, listProjectTasks, listTasks } from './slices/views/views.queries';
