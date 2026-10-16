'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import {
  updateNotificationPreferenceAction,
  type NotificationChannel,
  type NotificationPreferenceDto,
} from '@/modules/notifications/client';

const CHANNELS: { channel: NotificationChannel; label: string }[] = [
  { channel: 'inApp', label: 'В приложении' },
  { channel: 'email', label: 'Email' },
];

interface Change {
  type: NotificationPreferenceDto['type'];
  channel: NotificationChannel;
  enabled: boolean;
}

/** Матрица «событие × канал»: каждый переключатель сохраняется сразу. */
export function NotificationSettings({ items }: { items: NotificationPreferenceDto[] }) {
  const [optimistic, applyChange] = useOptimistic(items, (current, change: Change) =>
    current.map((item) =>
      item.type === change.type
        ? { ...item, value: { ...item.value, [change.channel]: change.enabled } }
        : item,
    ),
  );
  const [, startTransition] = useTransition();

  function toggle(change: Change) {
    startTransition(async () => {
      applyChange(change);
      const result = await updateNotificationPreferenceAction(change);
      // При ошибке оптимистичное значение откатится само после завершения перехода.
      if (!result.ok) toast.error(result.error.message);
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th scope="col" className="px-4 py-2.5 font-medium">
              Событие
            </th>
            {CHANNELS.map(({ channel, label }) => (
              <th key={channel} scope="col" className="w-32 px-4 py-2.5 text-center font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {optimistic.map((item) => (
            <tr key={item.type} className="border-b last:border-b-0">
              <th scope="row" className="px-4 py-3 text-left font-normal">
                <span className="block font-medium">{item.label}</span>
                <span className="block text-muted-foreground">{item.description}</span>
              </th>
              {CHANNELS.map(({ channel, label }) => {
                const supported = item.channels.includes(channel);
                return (
                  <td key={channel} className="px-4 py-3 text-center">
                    <Switch
                      checked={supported && item.value[channel]}
                      disabled={!supported}
                      aria-label={`${item.label}: ${label}`}
                      title={supported ? undefined : 'Недоступно для этого события'}
                      onCheckedChange={(enabled) => toggle({ type: item.type, channel, enabled })}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
