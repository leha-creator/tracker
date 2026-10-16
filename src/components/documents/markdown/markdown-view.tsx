import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

import {
  createHeadingSlugger,
  isAllowedImageSrc,
  isExternalUrl,
  safeMarkdownUrl,
} from './markdown-urls';

/** Узел hast — ровно то, что нужно для текста заголовка. */
interface HastNode {
  type: string;
  value?: string;
  children?: HastNode[];
}

function textOf(nodes: readonly HastNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => (node.type === 'text' ? (node.value ?? '') : textOf(node.children)))
    .join('');
}

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

function buildComponents(): Components {
  const slug = createHeadingSlugger();
  const heading = (Tag: HeadingTag, className: string) => {
    function MarkdownHeading({ node, children }: { node?: HastNode; children?: ReactNode }) {
      return (
        <Tag
          id={slug(textOf(node?.children))}
          className={cn('scroll-mt-20 font-semibold tracking-tight', className)}
        >
          {children}
        </Tag>
      );
    }
    return MarkdownHeading;
  };

  return {
    h1: heading('h1', 'mt-8 mb-3 text-2xl first:mt-0'),
    h2: heading('h2', 'mt-7 mb-3 text-xl first:mt-0'),
    h3: heading('h3', 'mt-6 mb-2 text-lg first:mt-0'),
    h4: heading('h4', 'mt-5 mb-2 text-base first:mt-0'),
    h5: heading('h5', 'mt-4 mb-2 text-sm first:mt-0'),
    h6: heading('h6', 'mt-4 mb-2 text-sm text-muted-foreground first:mt-0'),
    p: ({ children }) => <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>,
    a: ({ href, children }) => {
      if (!href) return <span>{children}</span>;
      const external = isExternalUrl(href);
      return (
        <a
          href={href}
          className="font-medium text-primary underline underline-offset-4 hover:no-underline"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt }) => {
      const source = typeof src === 'string' ? src : undefined;
      if (!isAllowedImageSrc(source)) {
        // Внешние картинки не загружаем (трекинг, подмена) — показываем ссылкой.
        const href = source ? safeMarkdownUrl(source) : '';
        return href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline"
          >
            {alt || 'Изображение'}
          </a>
        ) : (
          <span>{alt}</span>
        );
      }
      return (
        // Картинка из хранилища пространства через проверку доступа: next/image здесь не нужен.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt={alt ?? ''}
          loading="lazy"
          className="my-4 max-h-[32rem] max-w-full rounded-lg border"
        />
      );
    },
    ul: ({ children, className }) => (
      <ul
        className={cn(
          'my-3 grid gap-1 pl-6',
          className?.includes('contains-task-list') ? 'list-none pl-1' : 'list-disc',
        )}
      >
        {children}
      </ul>
    ),
    ol: ({ children, start }) => (
      <ol start={start} className="my-3 grid list-decimal gap-1 pl-6">
        {children}
      </ol>
    ),
    li: ({ children, className }) => (
      <li
        className={cn(
          'leading-7',
          className?.includes('task-list-item') && 'flex items-start gap-2',
        )}
      >
        {children}
      </li>
    ),
    input: ({ checked, type }) =>
      type === 'checkbox' ? (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          readOnly
          disabled
          aria-label={checked ? 'Выполнено' : 'Не выполнено'}
          className="mt-1.5 size-4 shrink-0 accent-primary"
        />
      ) : null,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-4 pl-4 text-muted-foreground">{children}</blockquote>
    ),
    hr: () => <hr className="my-6 border-border" />,
    pre: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-lg border bg-muted p-4 text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    ),
    code: ({ children, className }) => (
      <code className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em]', className)}>
        {children}
      </code>
    ),
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
    th: ({ children, style }) => (
      <th style={style} className="border-b px-3 py-2 text-left font-medium">
        {children}
      </th>
    ),
    td: ({ children, style }) => (
      <td style={style} className="border-b px-3 py-2 align-top">
        {children}
      </td>
    ),
  };
}

/**
 * Markdown документа (GFM: таблицы, чек-листы, зачёркивание, автоссылки). Сырой HTML
 * пропускается (`skipHtml`), адреса проходят через `safeMarkdownUrl`, картинки — только из
 * хранилища пространства. Работает и на сервере, и в предпросмотре редактора.
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('min-w-0 text-[0.9375rem] break-words', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeMarkdownUrl}
        components={buildComponents()}
      >
        {source}
      </Markdown>
    </div>
  );
}
