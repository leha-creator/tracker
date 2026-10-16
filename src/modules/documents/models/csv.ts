/** Строк таблицы в просмотре CSV/TSV. */
export const CSV_PREVIEW_MAX_ROWS = 500;

export interface DelimitedTable {
  rows: string[][];
  /** Строк в файле больше, чем показано. */
  truncated: boolean;
}

/**
 * Разбор CSV/TSV по RFC 4180: поля в кавычках, `""` внутри кавычек, переводы строк внутри
 * кавычек, CRLF. BOM в начале отбрасывается, пустая строка в конце файла не считается.
 */
export function parseDelimited(
  input: string,
  delimiter: ',' | ';' | '\t',
  maxRows: number = CSV_PREVIEW_MAX_ROWS,
): DelimitedTable {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
  };

  while (index < text.length) {
    const char = text[index] as string;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
      } else {
        field += char;
      }
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      endRow();
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      if (rows.length > maxRows) break;
    } else {
      field += char;
    }
    index += 1;
  }

  if (rows.length <= maxRows && (field !== '' || row.length > 0)) endRow();

  const truncated = rows.length > maxRows || index < text.length;
  return { rows: rows.slice(0, maxRows), truncated };
}

/** Разделитель CSV: `;` (Excel в русской локали) или `,` — по первой строке. */
export function detectCsvDelimiter(input: string): ',' | ';' {
  const firstLine = input.slice(0, input.search(/\r?\n|$/));
  const count = (char: string) => firstLine.split(char).length - 1;
  return count(';') > count(',') ? ';' : ',';
}
