import { describe, expect, it } from 'vitest';

import { detectCsvDelimiter, parseDelimited } from './csv';

describe('parseDelimited', () => {
  it('parses simple rows and ignores the trailing newline', () => {
    expect(parseDelimited('a,b\n1,2\n', ',')).toEqual({
      rows: [
        ['a', 'b'],
        ['1', '2'],
      ],
      truncated: false,
    });
  });

  it('handles quotes, escaped quotes, delimiters and newlines inside quotes', () => {
    const input = 'name,comment\r\n"Иванов, И.","сказал ""да""\nи ушёл"\r\nx,';
    expect(parseDelimited(input, ',').rows).toEqual([
      ['name', 'comment'],
      ['Иванов, И.', 'сказал "да"\nи ушёл'],
      ['x', ''],
    ]);
  });

  it('strips BOM and supports tabs', () => {
    expect(parseDelimited('﻿a\tb', '\t').rows).toEqual([['a', 'b']]);
  });

  it('keeps empty lines as rows with one empty field', () => {
    expect(parseDelimited('a\n\nb', ',').rows).toEqual([['a'], [''], ['b']]);
  });

  it('truncates after maxRows', () => {
    const input = Array.from({ length: 10 }, (_, i) => `r${i}`).join('\n');
    const result = parseDelimited(input, ',', 3);
    expect(result.rows).toEqual([['r0'], ['r1'], ['r2']]);
    expect(result.truncated).toBe(true);
  });

  it('does not report truncation for exactly maxRows', () => {
    expect(parseDelimited('a\nb\nc\n', ',', 3).truncated).toBe(false);
    expect(parseDelimited('a\nb\nc', ',', 3).truncated).toBe(false);
  });

  it('returns no rows for empty input', () => {
    expect(parseDelimited('', ',')).toEqual({ rows: [], truncated: false });
  });
});

describe('detectCsvDelimiter', () => {
  it('prefers semicolon when it dominates the header', () => {
    expect(detectCsvDelimiter('a;b;c\n1,5;2;3')).toBe(';');
    expect(detectCsvDelimiter('a,b\n1;2')).toBe(',');
  });
});
