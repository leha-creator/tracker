/**
 * Публичный API модуля для клиентских компонентов: Server Actions, константы и типы.
 * Без server-only кода (сервисов) — их экспортирует только index.ts.
 */
export {
  isSearchableQuery,
  normalizeSearchQuery,
  SEARCH_LIMIT_PER_GROUP,
  SEARCH_QUERY_MAX_LENGTH,
} from './models';
export { globalSearchAction } from './slices/global/global.actions';
export type {
  GlobalSearchResultDto,
  MemberSearchResultDto,
  WorkspaceSearchResultDto,
} from './slices/global/global.dto';
