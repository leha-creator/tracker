'use client';

import { useActionState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { SettingsSection } from '@/components/layout/settings-section';
import {
  DEFAULT_QUOTA_MAX_MB,
  DEFAULT_QUOTA_MIN_MB,
  updateStorageSettingsAction,
  type AdminStorageSettingsDto,
} from '@/modules/admin/client';
import type { FormState } from '@/shared/types';

import { SettingsSaveRow } from './settings-save-row';

/** Группа «Хранилище»: квота документов пространства по умолчанию. */
export function StorageSettingsForm({ storage }: { storage: AdminStorageSettingsDto }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateStorageSettingsAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <SettingsSection
      title="Хранилище"
      description="Квота документов пространства, если у него не задана своя (её меняют на странице пространства в админке)."
    >
      <form action={formAction} className="grid gap-4" noValidate>
        <FormError message={fieldErrors ? undefined : failure?.error.message} />
        <div className="grid gap-2 sm:w-72">
          <FormField
            name="defaultWorkspaceQuotaMb"
            label="Квота по умолчанию, МБ"
            inputMode="numeric"
            placeholder={`${storage.envQuotaMb} (из окружения)`}
            min={DEFAULT_QUOTA_MIN_MB}
            max={DEFAULT_QUOTA_MAX_MB}
            defaultValue={
              failure?.values.defaultWorkspaceQuotaMb ??
              (storage.defaultWorkspaceQuotaMb === null
                ? ''
                : String(storage.defaultWorkspaceQuotaMb))
            }
            errors={fieldErrors?.defaultWorkspaceQuotaMb}
          />
          <p className="text-sm text-muted-foreground">
            Пусто — DOCUMENTS_WORKSPACE_QUOTA_MB ({storage.envQuotaMb} МБ).
          </p>
        </div>
        <SettingsSaveRow pending={pending} saved={state?.ok === true} />
      </form>
    </SettingsSection>
  );
}
