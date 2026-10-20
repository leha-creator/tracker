import { HelpArticleCard } from '@/components/help/help-article-card';
import { PageHeader, SectionHeading } from '@/components/layout/page-header';
import { groupArticlesBySection } from '@/modules/help';

export default function HelpIndexPage() {
  const groups = groupArticlesBySection();
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Справка"
        description={
          <p className="max-w-2xl">
            Как работать с Tasker: от первого входа до агентов Claude Code. Статьи разбиты по
            разделам, у каждой указано, для кого она: для любого участника, для владельца
            пространства или для тех, кто подключает агентов.
          </p>
        }
      />
      {groups.map(({ section, articles }) => (
        <section
          key={section.id}
          aria-labelledby={`help-section-${section.id}`}
          className="grid gap-3"
        >
          <SectionHeading id={`help-section-${section.id}`} title={section.title} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {articles.map((article) => (
              <HelpArticleCard key={article.slug} article={article} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
