export {
  findHelpArticle,
  getAdjacentArticles,
  groupArticlesBySection,
  HELP_ARTICLES,
  HELP_AUDIENCE_LABELS,
  HELP_SECTIONS,
} from './help-catalog';
export type { HelpArticleMeta, HelpAudience, HelpSection } from './help-catalog';
export { extractHeadings, extractHelpLinks, extractImageRefs } from './help-content';
export type { HelpHeading } from './help-content';
