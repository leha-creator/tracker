import type { StoredActionItem } from './action-items';
import type { RecapSummary } from './webhook-events';

// Заметка с конспектом встречи. Markdown собирает tasker: строки из meet — обычный текст, поэтому
// символы разметки экранируются и ссылки или HTML в конспекте не оживают.

/** Ограничение длины названия документа. */
const TITLE_MAX_LENGTH = 200;

/** Экранирует разметку Markdown в строке пользовательского текста; переводы строк — пробелы. */
export function escapeMarkdownInline(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_{}[\]()<>#+\-.!|~]/g, (char) => `\\${char}`);
}

/** Абзацы обзора: пустые строки делят абзацы, внутри абзаца — экранированный текст. */
function paragraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map(escapeMarkdownInline)
    .filter((paragraph) => paragraph.length > 0);
}

function bulletList(items: readonly string[]): string[] {
  return items
    .map(escapeMarkdownInline)
    .filter((item) => item.length > 0)
    .map((item) => `- ${item}`);
}

function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

function formatDue(isoDate: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

export interface SummaryNoteInput {
  summary: RecapSummary;
  actionItems: readonly StoredActionItem[];
  taskKey: string;
  meetingUrl: string;
  completedAt: Date;
  /** Часовой пояс даты в названии (REMINDERS_TIMEZONE). */
  timeZone: string;
}

/** Название и Markdown заметки с конспектом. Пустые разделы не выводятся. */
export function renderMeetingSummaryNote(input: SummaryNoteInput): {
  title: string;
  content: string;
} {
  const date = formatDate(input.completedAt, input.timeZone);
  const title = `Встреча ${date} — ${input.taskKey}`.slice(0, TITLE_MAX_LENGTH);

  const sections: string[][] = [];
  const overview = paragraphs(input.summary.overview);
  if (overview.length > 0) sections.push(['## Обзор', '', ...overview.flatMap((p) => [p, ''])]);

  const topics = bulletList(input.summary.topics);
  if (topics.length > 0) sections.push(['## Темы', '', ...topics, '']);

  const decisions = bulletList(input.summary.decisions);
  if (decisions.length > 0) sections.push(['## Решения', '', ...decisions, '']);

  const actionItems = input.actionItems.map((item) => {
    const owner = item.owner ? ` — ${escapeMarkdownInline(item.owner)}` : '';
    const due = item.due ? `, до ${formatDue(item.due)}` : '';
    return `- [ ] ${escapeMarkdownInline(item.task)}${owner}${due}`;
  });
  if (actionItems.length > 0) sections.push(['## Поручения', '', ...actionItems, '']);

  const questions = bulletList(input.summary.openQuestions);
  if (questions.length > 0) sections.push(['## Открытые вопросы', '', ...questions, '']);

  if (sections.length === 0) sections.push(['Конспект пуст: на записи не нашлось содержания.', '']);

  const footer = `Созвон по задаче ${input.taskKey} в meet: <${input.meetingUrl}>`;
  const content = [...sections.flat(), '---', '', footer, ''].join('\n');
  return { title, content };
}
