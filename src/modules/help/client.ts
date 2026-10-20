/**
 * Публичный API модуля для клиентских компонентов: каталог статей и чистые функции.
 * Без server-only кода (чтения файлов) — его экспортирует только index.ts.
 */
export {
  extractHeadings,
  findHelpArticle,
  getAdjacentArticles,
  groupArticlesBySection,
  HELP_ARTICLES,
  HELP_AUDIENCE_LABELS,
  HELP_SECTIONS,
} from './models';
export type { HelpArticleMeta, HelpAudience, HelpHeading, HelpSection } from './models';
