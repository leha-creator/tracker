/**
 * Экспорт задач в CSV для Excel и Google Таблиц: разделитель `;` (русская локаль Excel),
 * BOM для UTF-8, строки через `\r\n`. Ячейки, похожие на формулу, получают префикс `'`
 * (защита от CSV/formula injection).
 */

/** Предел строк в одной выгрузке; больше — файл обрезается и помечается. */
export const TASK_EXPORT_MAX_ROWS = 10_000;

const SEPARATOR = ';';
const BOM = '﻿';
/** С этих символов табличные редакторы начинают формулу. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => string | number | null | undefined;
}

export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const lines = [
    columns.map((column) => escapeCsvCell(column.header)).join(SEPARATOR),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(column.value(row))).join(SEPARATOR)),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Строка выгрузки — уже в виде текста, без зависимостей от DTO. */
export interface TaskCsvRow {
  key: string;
  title: string;
  /** «Проект: статус» через запятую; пусто — вне проектов. */
  statuses: string[];
  priority: string;
  assignee: string | null;
  /** `YYYY-MM-DD` или null. */
  dueDate: string | null;
  labels: string[];
  parentKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  url: string;
}

/** Дата и время в ISO без миллисекунд (UTC) — однозначно для любой локали таблицы. */
function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const TASK_CSV_COLUMNS: readonly CsvColumn<TaskCsvRow>[] = [
  { header: 'Ключ', value: (row) => row.key },
  { header: 'Название', value: (row) => row.title },
  { header: 'Статус', value: (row) => row.statuses.join(', ') },
  { header: 'Приоритет', value: (row) => row.priority },
  { header: 'Ответственный', value: (row) => row.assignee },
  { header: 'Срок', value: (row) => row.dueDate },
  { header: 'Метки', value: (row) => row.labels.join(', ') },
  { header: 'Родитель', value: (row) => row.parentKey },
  { header: 'Создана', value: (row) => isoDateTime(row.createdAt) },
  { header: 'Обновлена', value: (row) => isoDateTime(row.updatedAt) },
  { header: 'Ссылка', value: (row) => row.url },
];

/** `tasker-<slug>-2026-10-17.csv` — дата выгрузки (UTC). */
export function exportFileName(workspaceSlug: string, date: Date): string {
  const safeSlug = workspaceSlug.replace(/[^a-z0-9-]/gi, '') || 'workspace';
  return `tasker-${safeSlug}-${date.toISOString().slice(0, 10)}.csv`;
}
