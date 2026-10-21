'use client';

import { Video } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useStartMeeting } from './use-start-meeting';

/** Кнопка «Начать созвон» в разделе «Созвоны» задачи. */
export function StartMeetingButton({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}) {
  const { pending, start } = useStartMeeting({ workspaceId, taskId });
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      onClick={start}
    >
      <Video />
      Начать созвон
    </Button>
  );
}
