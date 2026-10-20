import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { cacheLife } from 'next/cache';

import { createLogger } from '@/shared/logger';

import { findHelpArticle, type HelpArticleMeta } from '../../models';

const log = createLogger('help');

/** Папка статей; в standalone-сборку попадает через `outputFileTracingIncludes`. */
const HELP_CONTENT_DIR = path.join(process.cwd(), 'content', 'help');

export interface HelpArticle {
  meta: HelpArticleMeta;
  markdown: string;
}

/**
 * Статья справки по slug или `null`. Путь собирается только из slug каталога — пользовательский
 * ввод в `path.join` не попадает. Статьи меняются только с деплоем, поэтому кеш долгий.
 */
export async function getHelpArticle(slug: string): Promise<HelpArticle | null> {
  'use cache';
  cacheLife('max');

  const meta = findHelpArticle(slug);
  if (!meta) return null;

  try {
    const markdown = await readFile(path.join(HELP_CONTENT_DIR, `${meta.slug}.md`), 'utf8');
    log.debug({ slug: meta.slug, length: markdown.length }, '[help.article] read');
    return { meta, markdown };
  } catch (error) {
    log.warn({ slug: meta.slug, err: error }, '[help.article] file is missing');
    return null;
  }
}
