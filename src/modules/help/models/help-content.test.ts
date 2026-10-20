import { describe, expect, it } from 'vitest';

import { createHeadingSlugger } from '@/components/documents/markdown/markdown-urls';

import { extractHeadings, extractHelpLinks, extractImageRefs } from './help-content';

const SAMPLE = [
  '# Вступление',
  '',
  '## Колонки и **карточки**',
  '',
  '```bash',
  '# комментарий, не заголовок',
  '## и это тоже',
  '```',
  '',
  '### Клавиши `Space` и [Enter](/help/board)',
  '',
  '## Колонки и карточки',
  '',
  '#### Мелкий заголовок',
  '',
  '![Доска](/help-media/board/board.png "Подпись") и [список](/help/task-list#фильтры).',
  '',
  '~~~',
  '![не картинка](/help-media/x.png) [не ссылка](/help/nope)',
  '~~~',
].join('\n');

describe('extractHeadings', () => {
  it('collects ## and ### outside code blocks', () => {
    const headings = extractHeadings(SAMPLE, createHeadingSlugger());
    expect(headings).toEqual([
      { depth: 2, text: 'Колонки и карточки', id: 'колонки-и-карточки' },
      { depth: 3, text: 'Клавиши Space и Enter', id: 'клавиши-space-и-enter' },
      { depth: 2, text: 'Колонки и карточки', id: 'колонки-и-карточки-1' },
    ]);
  });

  it('keeps underscores inside words and strips emphasis', () => {
    const headings = extractHeadings(
      '## Сценарии start_task и finish_task\n\n## **Жирный** и _курсив_ и __ещё__\n',
      createHeadingSlugger(),
    );
    expect(headings.map((h) => h.text)).toEqual([
      'Сценарии start_task и finish_task',
      'Жирный и курсив и ещё',
    ]);
  });
});

describe('extractImageRefs / extractHelpLinks', () => {
  it('finds images and help links outside code blocks', () => {
    expect(extractImageRefs(SAMPLE)).toEqual(['/help-media/board/board.png']);
    expect(extractHelpLinks(SAMPLE)).toEqual([
      { slug: 'board', anchor: null },
      { slug: 'task-list', anchor: 'фильтры' },
    ]);
  });

  it('decodes encoded anchors', () => {
    expect(extractHelpLinks('[x](/help/board#%D0%B4%D0%BE%D1%81%D0%BA%D0%B0)')).toEqual([
      { slug: 'board', anchor: 'доска' },
    ]);
  });
});
