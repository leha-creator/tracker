// Настройки съёмки скриншотов справки (pnpm help:screenshots).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..', '..');
export const BASE_URL = (process.env.HELP_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '');
export const OUTPUT_DIR = path.join(ROOT, 'public', 'help-media');
/** Пароли, cookie и id засеянных данных — только локально, в .gitignore. */
export const STATE_DIR = path.join(HERE, '.state');

export const VIEWPORT = { width: 1440, height: 900 };
export const TIMEZONE = 'Europe/Moscow';
export const LOCALE = 'ru-RU';
/** Снимки крупнее — повод проверить, не попало ли в кадр лишнее. */
export const MAX_SHOT_BYTES = 400 * 1024;

export const WORKSPACE = { name: 'Студия Север', slug: 'studio-sever', key: 'SEV' };

/** Демо-пользователи: Анна — владелец, Борис и Вера — участники. */
export const USERS = {
  anna: { name: 'Анна Смирнова', email: 'anna@help.example.com', title: 'Руководитель студии' },
  boris: { name: 'Борис Петров', email: 'boris@help.example.com', title: 'Разработчик' },
  vera: { name: 'Вера Козлова', email: 'vera@help.example.com', title: 'Дизайнер' },
};

/** Приглашение, которое остаётся ожидающим. */
export const PENDING_INVITE_EMAIL = 'gleb@help.example.com';

export const log = (...parts) => console.log('[help-screenshots]', ...parts);

/**
 * Локальный IdP plwedding ID: вход в Tasker только через него. Клиент tasker в IdP должен
 * разрешать origin сервера справки (OIDC_TASKER_ORIGIN=http://localhost:3001).
 */
export const IDP_URL = (process.env.HELP_IDP_URL ?? 'http://localhost:3005').replace(/\/$/, '');
/** Mailpit IdP: письма подтверждения email. */
export const IDP_MAILPIT_URL = (
  process.env.HELP_IDP_MAILPIT_URL ?? 'http://localhost:8026'
).replace(/\/$/, '');
