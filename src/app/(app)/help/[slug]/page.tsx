import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createHeadingSlugger } from '@/components/documents/markdown/markdown-urls';
import { MarkdownView } from '@/components/documents/markdown/markdown-view';
import { AudienceBadges } from '@/components/help/audience-badge';
import { HELP_HREF } from '@/components/help/help-href';
import { HelpPager } from '@/components/help/help-pager';
import { HelpToc } from '@/components/help/help-toc';
import {
  extractHeadings,
  findHelpArticle,
  getAdjacentArticles,
  getHelpArticle,
  HELP_ARTICLES,
  HELP_SECTIONS,
} from '@/modules/help';

/** Скриншоты справки — статические файлы из public/help-media/. */
const HELP_IMAGE_PREFIXES = ['/help-media/'] as const;

export function generateStaticParams() {
  return HELP_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: PageProps<'/help/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const article = findHelpArticle(slug);
  return { title: article ? `${article.title} — Справка Tasker` : 'Справка — Tasker' };
}

export default async function HelpArticlePage({ params }: PageProps<'/help/[slug]'>) {
  const { slug } = await params;
  const article = await getHelpArticle(slug);
  if (!article) notFound();

  const { meta, markdown } = article;
  const section = HELP_SECTIONS.find((item) => item.id === meta.section);
  const headings = extractHeadings(markdown, createHeadingSlugger());
  const { prev, next } = getAdjacentArticles(meta.slug);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-10">
      <article className="grid min-w-0 content-start gap-6">
        <header className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            <Link href={HELP_HREF} className="hover:text-foreground hover:underline">
              Справка
            </Link>
            {section ? <> · {section.title}</> : null}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
          <p className="text-muted-foreground">{meta.summary}</p>
          <AudienceBadges audience={meta.audience} />
        </header>
        <MarkdownView source={markdown} imagePrefixes={HELP_IMAGE_PREFIXES} className="max-w-3xl" />
        <HelpPager prev={prev} next={next} />
      </article>
      <aside className="hidden min-w-0 xl:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">
          <HelpToc headings={headings} />
        </div>
      </aside>
    </div>
  );
}
