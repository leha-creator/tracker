'use client';

import { WrapTextIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Исходный текст с номерами строк; перенос длинных строк — по кнопке. */
export function TextViewer({ text }: { text: string }) {
  const [wrap, setWrap] = useState(false);
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');

  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setWrap((value) => !value)}
          aria-pressed={wrap}
        >
          <WrapTextIcon aria-hidden />
          Перенос строк
        </Button>
      </div>
      <div className="max-h-[75dvh] overflow-auto rounded-lg border bg-muted/40">
        <table className="w-full border-collapse font-mono text-[0.8125rem] leading-6">
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td
                  aria-hidden
                  className="w-px border-r px-3 text-right align-top text-muted-foreground tabular-nums select-none"
                >
                  {index + 1}
                </td>
                <td
                  className={cn(
                    'px-3 align-top',
                    wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre',
                  )}
                >
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
