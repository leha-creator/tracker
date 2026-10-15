// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
export * from './client';

export { getProject, listProjects } from './slices/project/project.service';
export { listStatuses, listWorkspaceStatuses } from './slices/status/status.service';
