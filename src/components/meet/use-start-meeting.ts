'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { startTaskMeetingAction } from '@/modules/integrations/meet/client';

/**
 * «Начать созвон»: вкладка открывается сразу по клику (иначе браузер заблокирует всплывающее
 * окно после await), адрес meet с подписанным контекстом задачи подставляется после действия.
 */
export function useStartMeeting(fields: { workspaceId: string; taskId: string }) {
  const [pending, startTransition] = useTransition();

  function start() {
    const tab = window.open('', '_blank');
    startTransition(async () => {
      const result = await startTaskMeetingAction(fields);
      if (!result.ok) {
        tab?.close();
        toast.error(result.error.message);
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = result.data.url;
      } else {
        // Всплывающие окна запрещены — открываем в этой вкладке.
        window.location.assign(result.data.url);
      }
    });
  }

  return { pending, start };
}
