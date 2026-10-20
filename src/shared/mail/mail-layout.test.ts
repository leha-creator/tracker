import { describe, expect, it } from 'vitest';

import { renderMailLayout } from './mail-layout';

describe('renderMailLayout', () => {
  it('ставит логотип по адресу приложения', () => {
    const html = renderMailLayout({ content: '<p>Тело</p>' });
    expect(html).toContain('src="http://localhost:3000/brand/logo-mail.png"');
    expect(html).toContain('alt="Tasker"');
    expect(html).toContain('<p>Тело</p>');
  });

  it('экранирует подпись и адрес кнопки', () => {
    const html = renderMailLayout({
      content: '',
      action: { label: '<b>Открыть</b>', url: 'https://tasker.test/a?x=1&y="2"' },
    });
    expect(html).toContain('&lt;b&gt;Открыть&lt;/b&gt;');
    expect(html).toContain('href="https://tasker.test/a?x=1&amp;y=&quot;2&quot;"');
    expect(html).not.toContain('<b>Открыть</b>');
  });

  it('без кнопки и подвала не оставляет пустых блоков', () => {
    const html = renderMailLayout({ content: '<p>x</p>' });
    expect(html).not.toContain('border-top');
    expect(html).not.toContain('Если кнопка не открывается');
  });
});
