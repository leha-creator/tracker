/**
 * Каталог статей справки: порядок чтения, разделы и аудитория. Тело статьи — Markdown в
 * `content/help/<slug>.md`, здесь только метаданные (без frontmatter и лишних зависимостей).
 */

export type HelpAudience = 'member' | 'owner' | 'agents';

export const HELP_AUDIENCE_LABELS: Record<HelpAudience, string> = {
  member: 'Участник',
  owner: 'Владелец',
  agents: 'Агенты',
};

export interface HelpSection {
  id: string;
  title: string;
}

export interface HelpArticleMeta {
  slug: string;
  title: string;
  summary: string;
  section: string;
  audience: readonly HelpAudience[];
}

export const HELP_SECTIONS: readonly HelpSection[] = [
  { id: 'start', title: 'Начало работы' },
  { id: 'tasks', title: 'Работа с задачами' },
  { id: 'docs', title: 'Документы и поиск' },
  { id: 'workspace', title: 'Управление пространством' },
  { id: 'integrations', title: 'Интеграции и агенты' },
];

export const HELP_ARTICLES: readonly HelpArticleMeta[] = [
  {
    slug: 'getting-started',
    title: 'Регистрация и вход',
    summary: 'Вход через plwedding ID, выход, приглашения и первое пространство.',
    section: 'start',
    audience: ['member'],
  },
  {
    slug: 'account-security',
    title: 'Безопасность аккаунта',
    summary: 'Пароль и 2FA в plwedding ID, сеансы в Tasker и журнал безопасности.',
    section: 'start',
    audience: ['member'],
  },
  {
    slug: 'profile-and-notifications',
    title: 'Профиль и уведомления',
    summary: 'Фото и «О себе», настройки уведомлений, колокольчик и профиль участника.',
    section: 'start',
    audience: ['member'],
  },
  {
    slug: 'tasks',
    title: 'Задачи',
    summary: 'Создание задачи, панель задачи, поля, несколько проектов, срок, история и архив.',
    section: 'tasks',
    audience: ['member'],
  },
  {
    slug: 'subtasks-labels-watchers',
    title: 'Подзадачи, метки и наблюдатели',
    summary: 'Как разбить задачу на части, пометить её метками и следить за изменениями.',
    section: 'tasks',
    audience: ['member'],
  },
  {
    slug: 'board',
    title: 'Доска',
    summary: 'Колонки и карточки, перетаскивание мышью и с клавиатуры, быстрое создание задач.',
    section: 'tasks',
    audience: ['member'],
  },
  {
    slug: 'task-list',
    title: 'Список задач и «Мои задачи»',
    summary: 'Фильтры, поиск по номеру, сортировка, сохранённые фильтры и экспорт в CSV.',
    section: 'tasks',
    audience: ['member'],
  },
  {
    slug: 'comments-and-attachments',
    title: 'Комментарии и вложения',
    summary: 'Обсуждение задачи, @упоминания, файлы в задаче и в комментариях.',
    section: 'tasks',
    audience: ['member'],
  },
  {
    slug: 'workspace-overview',
    title: 'Обзор пространства',
    summary: 'Счётчики задач, нагрузка участников, проекты и просроченные задачи.',
    section: 'tasks',
    audience: ['member'],
  },
  {
    slug: 'documents',
    title: 'Документы',
    summary: 'Папки, теги, Markdown-заметки, загрузка и просмотр файлов, привязка к задачам.',
    section: 'docs',
    audience: ['member'],
  },
  {
    slug: 'search-and-shortcuts',
    title: 'Поиск и горячие клавиши',
    summary: 'Палитра Cmd+K, все сочетания клавиш и обновления в реальном времени.',
    section: 'docs',
    audience: ['member'],
  },
  {
    slug: 'workspaces',
    title: 'Пространства',
    summary: 'Создание и настройки пространства, ключ задач, архив и удаление.',
    section: 'workspace',
    audience: ['owner'],
  },
  {
    slug: 'members-and-access',
    title: 'Участники и права',
    summary: 'Приглашения, роли, права на проекты и документы, исключение участника.',
    section: 'workspace',
    audience: ['owner'],
  },
  {
    slug: 'projects-and-statuses',
    title: 'Проекты, статусы и метки',
    summary: 'Создание проекта, колонки-статусы и их категории, архив проекта, метки пространства.',
    section: 'workspace',
    audience: ['owner'],
  },
  {
    slug: 'github',
    title: 'GitHub',
    summary: 'Репозитории, ключ задачи в ветках и PR, автосмена статуса, уведомления о PR.',
    section: 'integrations',
    audience: ['owner', 'member'],
  },
  {
    slug: 'agents-and-tokens',
    title: 'Агенты и токены доступа',
    summary: 'Агенты пространства, личные токены, области доступа и журнал действий.',
    section: 'integrations',
    audience: ['owner', 'agents'],
  },
  {
    slug: 'claude-code-mcp',
    title: 'Claude Code и MCP',
    summary: 'Подключение Claude Code, инструменты MCP, промпты start_task и finish_task.',
    section: 'integrations',
    audience: ['agents'],
  },
];

export function findHelpArticle(slug: string): HelpArticleMeta | null {
  return HELP_ARTICLES.find((article) => article.slug === slug) ?? null;
}

/** Соседние статьи в порядке чтения — для «Предыдущая / Следующая». */
export function getAdjacentArticles(slug: string): {
  prev: HelpArticleMeta | null;
  next: HelpArticleMeta | null;
} {
  const index = HELP_ARTICLES.findIndex((article) => article.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: HELP_ARTICLES[index - 1] ?? null,
    next: HELP_ARTICLES[index + 1] ?? null,
  };
}

/** Статьи по разделам в порядке `HELP_SECTIONS`; пустые разделы пропускаются. */
export function groupArticlesBySection(): { section: HelpSection; articles: HelpArticleMeta[] }[] {
  return HELP_SECTIONS.map((section) => ({
    section,
    articles: HELP_ARTICLES.filter((article) => article.section === section.id),
  })).filter((group) => group.articles.length > 0);
}
