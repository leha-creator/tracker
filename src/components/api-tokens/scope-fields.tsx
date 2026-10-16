'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  API_TOKEN_SCOPE_DESCRIPTIONS,
  API_TOKEN_SCOPE_LABELS,
  API_TOKEN_SCOPES,
  type ApiTokenScope,
} from '@/modules/api-tokens/client';

/**
 * Области токена при выпуске: чекбоксы `scopes`. «Чтение» есть всегда — отмечено и недоступно
 * (сервер добавляет его сам). По умолчанию отмечены все области.
 */
export function ScopeFields({ defaultScopes }: { defaultScopes?: readonly ApiTokenScope[] }) {
  const initial = new Set<ApiTokenScope>(defaultScopes ?? API_TOKEN_SCOPES);
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Области</legend>
      {API_TOKEN_SCOPES.map((scope) => {
        const id = `api-token-scope-${scope}`;
        const always = scope === 'read';
        return (
          <div key={scope} className="flex items-start gap-2">
            <Checkbox
              id={id}
              name="scopes"
              value={scope}
              defaultChecked={always || initial.has(scope)}
              disabled={always}
              className="mt-0.5"
            />
            <div className="grid gap-0.5">
              <Label htmlFor={id} className="font-normal">
                {API_TOKEN_SCOPE_LABELS[scope]}
              </Label>
              <p className="text-xs text-muted-foreground">{API_TOKEN_SCOPE_DESCRIPTIONS[scope]}</p>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
