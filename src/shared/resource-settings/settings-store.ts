import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import type { SignupMode } from './signup-policy';

const log = createLogger('resource-settings');

const SETTINGS_ID = 'default';
/** Настройки читаются часто (каждая регистрация, каждая загрузка файла): кеш процесса. */
const RELOAD_INTERVAL_MS = 30_000;

/** Строка ResourceSettings целиком. Группы («Регистрация», «Хранилище») читают свои поля. */
export interface ResourceSettingsRow {
  signupMode: SignupMode;
  /** Домены в нижнем регистре; пусто — любые. */
  allowedEmailDomains: string[];
  /** Квота хранилища пространства по умолчанию, МБ; null — DOCUMENTS_WORKSPACE_QUOTA_MB. */
  defaultWorkspaceQuotaMb: number | null;
  updatedAt: Date | null;
  updatedById: string | null;
}

export const DEFAULT_RESOURCE_SETTINGS: ResourceSettingsRow = {
  signupMode: 'open',
  allowedEmailDomains: [],
  defaultWorkspaceQuotaMb: null,
  updatedAt: null,
  updatedById: null,
};

// Кеш в globalThis: переживает HMR в dev, как Prisma-клиент и конфиг GitHub App.
const globalForSettings = globalThis as unknown as {
  resourceSettings?: { value: ResourceSettingsRow; loadedAt: number };
};

export async function readSettingsRow(): Promise<ResourceSettingsRow> {
  const row = await prisma.resourceSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return DEFAULT_RESOURCE_SETTINGS;
  return {
    signupMode: row.signupMode,
    allowedEmailDomains: row.allowedEmailDomains,
    defaultWorkspaceQuotaMb: row.defaultWorkspaceQuotaMb,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
  };
}

/**
 * Настройки ресурса с кешем на 30 секунд. Ошибка БД — прежнее значение (или значения по
 * умолчанию): настройки не должны ломать вход и загрузку файлов.
 */
export async function loadResourceSettings(): Promise<ResourceSettingsRow> {
  const cached = globalForSettings.resourceSettings;
  if (cached && Date.now() - cached.loadedAt < RELOAD_INTERVAL_MS) return cached.value;
  try {
    const value = await readSettingsRow();
    globalForSettings.resourceSettings = { value, loadedAt: Date.now() };
    return value;
  } catch (error) {
    log.warn({ err: error }, '[resourceSettings.load] failed');
    return cached?.value ?? DEFAULT_RESOURCE_SETTINGS;
  }
}

/**
 * Сохраняет поля одной группы и сбрасывает кеш процесса. Другие процессы увидят изменения в
 * течение 30 секунд.
 */
export async function writeSettingsFields(
  fields: Omit<Prisma.ResourceSettingsUncheckedCreateInput, 'id' | 'updatedById'>,
  actorId: string,
  scope: string,
): Promise<void> {
  await prisma.resourceSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...fields, updatedById: actorId },
    update: { ...fields, updatedById: actorId },
  });
  globalForSettings.resourceSettings = undefined;
  log.info({ actorId, fields: Object.keys(fields) }, `[resourceSettings.save] ${scope}`);
}
