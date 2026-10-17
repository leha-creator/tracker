import { describe, expect, it } from 'vitest';

import {
  escapeCsvCell,
  exportFileName,
  TASK_CSV_COLUMNS,
  toCsv,
  type TaskCsvRow,
} from './task-csv';

describe('escapeCsvCell', () => {
  it('leaves plain values as is and empties nulls', () => {
    expect(escapeCsvCell('Макет')).toBe('Макет');
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('quotes separators, quotes and line breaks', () => {
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('строка 1\nстрока 2')).toBe('"строка 1\nстрока 2"');
  });

  it('neutralises formula-like text', () => {
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvCell('+7 999')).toBe("'+7 999");
    expect(escapeCsvCell('-1')).toBe("'-1");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvCell('\tcmd')).toBe("'\tcmd");
    // Числа — не текст пользователя, их не трогаем.
    expect(escapeCsvCell(-1)).toBe('-1');
  });
});

describe('toCsv', () => {
  const row: TaskCsvRow = {
    key: 'TSK-1',
    title: 'Шапка;меню',
    statuses: ['Сайт: В работе', 'Бренд: Готово'],
    priority: 'Высокий',
    assignee: null,
    dueDate: '2026-10-20',
    labels: [],
    parentKey: null,
    createdAt: new Date('2026-10-01T10:00:00.123Z'),
    updatedAt: new Date('2026-10-02T11:30:00.000Z'),
    url: 'https://tracker.example/w/a/tasks/1',
  };

  it('starts with a BOM, uses ; and CRLF', () => {
    const csv = toCsv([row], TASK_CSV_COLUMNS);
    expect(csv.startsWith('﻿Ключ;Название;Статус;')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')[1]).toBe(
      'TSK-1;"Шапка;меню";Сайт: В работе, Бренд: Готово;Высокий;;2026-10-20;;;' +
        '2026-10-01T10:00:00Z;2026-10-02T11:30:00Z;https://tracker.example/w/a/tasks/1',
    );
  });

  it('only a header when there are no rows', () => {
    expect(toCsv([], TASK_CSV_COLUMNS).split('\r\n')).toHaveLength(2);
  });
});

describe('exportFileName', () => {
  it('uses the slug and the date', () => {
    expect(exportFileName('studio', new Date('2026-10-17T12:00:00Z'))).toBe(
      'tasker-studio-2026-10-17.csv',
    );
    expect(exportFileName('../x', new Date('2026-10-17T12:00:00Z'))).toBe(
      'tasker-x-2026-10-17.csv',
    );
  });
});
