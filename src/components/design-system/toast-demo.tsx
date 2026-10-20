'use client';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/** Кнопки показа уведомлений-тостов: успех и ошибка. */
export function ToastDemo() {
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => toast.success('Изменения сохранены')}>
        Тост: успех
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => toast.error('Не удалось сохранить. Попробуйте ещё раз.')}
      >
        Тост: ошибка
      </Button>
    </>
  );
}
