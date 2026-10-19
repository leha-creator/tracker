'use client';

import { useActionState, useState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { SettingsSection } from '@/components/layout/settings-section';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ALLOWED_EMAIL_DOMAINS_MAX,
  updateSignupPolicyAction,
  type AdminSignupPolicyDto,
} from '@/modules/admin/client';
import {
  SIGNUP_MODE_LABELS,
  SIGNUP_MODES,
  type SignupMode,
} from '@/shared/resource-settings/client';
import type { FormState } from '@/shared/types';

import { SettingsSaveRow } from './settings-save-row';

const SIGNUP_MODE_HINTS: Record<SignupMode, string> = {
  open: 'Зарегистрироваться может любой (с учётом доменов ниже).',
  invite_only: 'Только адреса с действующим приглашением в пространство.',
  closed: 'Новые аккаунты не создаются; ADMIN_EMAILS — по-прежнему можно.',
};

function isSignupMode(value: string): value is SignupMode {
  return (SIGNUP_MODES as readonly string[]).includes(value);
}

/**
 * Группа «Регистрация»: режим и разрешённые домены email. Отдельная форма — группа переедет в
 * IdP и удаляется без правок в «Хранилище».
 */
export function SignupSettingsForm({ policy }: { policy: AdminSignupPolicyDto }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateSignupPolicyAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const initialMode = failure?.values.signupMode ?? policy.signupMode;
  const [signupMode, setSignupMode] = useState<SignupMode>(
    isSignupMode(initialMode) ? initialMode : policy.signupMode,
  );
  const domainErrors = fieldErrors?.allowedEmailDomains;

  return (
    <SettingsSection
      title="Регистрация"
      description={`Кто может создать аккаунт: по форме и через GitHub. ADMIN_EMAILS не ограничиваются. Домены — до ${ALLOWED_EMAIL_DOMAINS_MAX}, приглашение в пространство снимает ограничение доменов.`}
    >
      <form action={formAction} className="grid gap-4" noValidate>
        <FormError message={fieldErrors ? undefined : failure?.error.message} />
        <input type="hidden" name="signupMode" value={signupMode} />
        <div className="grid gap-2">
          <Label htmlFor="signup-mode">Режим</Label>
          <Select
            value={signupMode}
            onValueChange={(value) => {
              if (isSignupMode(value)) setSignupMode(value);
            }}
          >
            <SelectTrigger id="signup-mode" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIGNUP_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {SIGNUP_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{SIGNUP_MODE_HINTS[signupMode]}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="allowed-email-domains">Разрешённые домены email</Label>
          <Textarea
            id="allowed-email-domains"
            name="allowedEmailDomains"
            rows={4}
            placeholder={'example.com\ncorp.example.org'}
            defaultValue={
              failure?.values.allowedEmailDomains ?? policy.allowedEmailDomains.join('\n')
            }
            aria-invalid={domainErrors ? true : undefined}
            aria-describedby={
              domainErrors ? 'allowed-email-domains-error' : 'allowed-email-domains-hint'
            }
          />
          {domainErrors && (
            <p id="allowed-email-domains-error" className="text-sm text-destructive">
              {domainErrors.join(' ')}
            </p>
          )}
          <p id="allowed-email-domains-hint" className="text-sm text-muted-foreground">
            Пусто — любые. Через запятую, пробел или с новой строки; поддомены — отдельно.
          </p>
        </div>
        <SettingsSaveRow pending={pending} saved={state?.ok === true} />
      </form>
    </SettingsSection>
  );
}
