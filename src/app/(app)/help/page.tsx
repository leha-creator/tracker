import { HelpArticleCard } from '@/components/help/help-article-card';
import { groupArticlesBySection } from '@/modules/help';

export default function HelpIndexPage() {
  const groups = groupArticlesBySection();
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Справка</h1>
        <p className="max-w-2xl text-muted-foreground">
          Как работать с Tasker: от первого входа до агентов Claude Code. Статьи разбиты по
          разделам, у каждой указано, для кого она: для любого участника, для владельца пространства
          или для тех, кто подключает агентов.
        </p>
      </div>
      {groups.map(({ section, articles }) => (
        <section
          key={section.id}
          aria-labelledby={`help-section-${section.id}`}
          className="grid gap-3"
        >
          <h2 id={`help-section-${section.id}`} className="text-lg font-semibold tracking-tight">
            {section.title}
          </h2>
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
