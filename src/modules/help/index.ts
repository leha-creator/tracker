// Публичный API модуля справки для серверного кода. Клиентским компонентам — './client'.
// Модуль ни от кого не зависит: каталог статей — в models, тексты — Markdown в content/help/,
// читаются только на сервере.
export * from './client';

export { getHelpArticle } from './slices/article/help-article.service';
export type { HelpArticle } from './slices/article/help-article.service';
