import { Badge } from '@/components/ui/badge';
import { HELP_AUDIENCE_LABELS, type HelpAudience } from '@/modules/help/client';

/** Для кого статья: «Участник», «Владелец», «Агенты». */
export function AudienceBadges({ audience }: { audience: readonly HelpAudience[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {audience.map((item) => (
        <Badge key={item} variant="outline" className="font-normal text-muted-foreground">
          {HELP_AUDIENCE_LABELS[item]}
        </Badge>
      ))}
    </span>
  );
}
