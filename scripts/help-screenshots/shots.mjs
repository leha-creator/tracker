// Список снимков справки: статья, имя файла, пользователь, адрес и подготовка экрана.
// Снимки ложатся в public/help-media/<article>/<name>.png, статьи ссылаются на них по этим путям.

import { goto, newUserContext, saveErrorShot, saveUserState, shoot } from './browser.mjs';
import { BASE_URL, log, PENDING_INVITE_EMAIL, WORKSPACE } from './config.mjs';
import { signUpThroughIdp } from './idp.mjs';

const W = `/w/${WORKSPACE.slug}`;

/** Ждать, пока страница отрисуется и догрузит данные. */
async function settle(page, ms = 400) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

const heading = (page, name) => page.getByRole('heading', { name, exact: true }).first();
const region = (page, name) => page.getByRole('region', { name });
const tokenRow = (page) => page.getByRole('row').filter({ hasText: 'Claude Code — ноутбук' });
const board = (state, key = 'site') => `${W}/projects/${state.projects[key].id}/board`;

/**
 * user — чей контекст (anna, boris, vera, guest — без входа, gleb — приглашённый);
 * url — строка или функция от состояния засева; prepare — действия до снимка;
 * shot — locator блока или undefined (весь экран); mask — что закрыть.
 */
export const SHOTS = [
  // --- Начало работы ---
  {
    article: 'getting-started',
    name: 'login',
    user: 'guest',
    url: '/login',
    ready: (page) => page.getByRole('button', { name: 'Войти через plwedding ID' }),
  },
  {
    article: 'getting-started',
    name: 'invite',
    user: 'gleb',
    url: (state) => state.inviteUrl,
    ready: (page) => page.getByRole('button', { name: 'Принять приглашение' }),
  },
  {
    article: 'getting-started',
    name: 'new-workspace',
    user: 'anna',
    url: '/?create=workspace',
    ready: (page) => page.getByRole('dialog'),
  },

  // --- Безопасность ---
  {
    article: 'account-security',
    name: 'security',
    user: 'anna',
    url: '/profile/security',
    ready: (page) => page.getByRole('link', { name: 'Пароль, 2FA и сессии в plwedding ID' }),
    fullPage: true,
  },

  // --- Профиль и уведомления ---
  {
    article: 'profile-and-notifications',
    name: 'profile',
    user: 'boris',
    url: '/profile',
    ready: (page) => page.getByLabel('Должность'),
  },
  {
    article: 'profile-and-notifications',
    name: 'notification-settings',
    user: 'anna',
    url: '/profile/notifications',
    ready: (page) => page.getByRole('table'),
    fullPage: true,
  },
  {
    article: 'profile-and-notifications',
    name: 'bell',
    user: 'anna',
    url: W,
    ready: (page) => page.getByRole('button', { name: /^Уведомления/ }),
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Уведомления/ }).click();
      await page.getByRole('dialog').getByRole('link').first().waitFor();
    },
  },
  {
    article: 'profile-and-notifications',
    name: 'member-profile',
    user: 'anna',
    url: async (state, page) => {
      await goto(page, `${W}/settings/members`, page.getByRole('table').first());
      const href = await page
        .getByRole('link', { name: 'Борис Петров' })
        .first()
        .getAttribute('href');
      return href;
    },
    ready: (page) => heading(page, 'Борис Петров'),
  },

  // --- Задачи ---
  {
    article: 'tasks',
    name: 'new-task',
    user: 'anna',
    url: (state) => `${board(state)}?task=new`,
    ready: (page) => page.getByRole('region', { name: 'Новая задача' }),
  },
  {
    article: 'tasks',
    name: 'task-panel',
    user: 'anna',
    url: (state) => `${board(state)}?task=${state.tasks.home}`,
    ready: (page) => region(page, 'Описание'),
  },
  {
    article: 'tasks',
    name: 'archived-task',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.oldLanding}`,
    ready: (page) => page.getByRole('button', { name: 'Восстановить' }),
  },
  {
    article: 'tasks',
    name: 'history',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.safari}`,
    ready: (page) => region(page, 'История'),
    prepare: async (page) => {
      // История свёрнута по умолчанию.
      await region(page, 'История').locator('summary').click();
      await region(page, 'История').getByRole('listitem').first().waitFor();
    },
    shot: (page) => region(page, 'История'),
  },

  // --- Подзадачи, метки, наблюдатели ---
  {
    article: 'subtasks-labels-watchers',
    name: 'subtasks',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.ds}`,
    ready: (page) => region(page, 'Подзадачи'),
    shot: (page) => region(page, 'Подзадачи'),
  },
  {
    article: 'subtasks-labels-watchers',
    name: 'labels',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.safari}`,
    ready: (page) => page.getByRole('button', { name: /^Метки/ }),
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Метки/ }).click();
      await page.locator('[cmdk-item]').first().waitFor();
    },
  },
  {
    article: 'subtasks-labels-watchers',
    name: 'watchers',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.safari}`,
    ready: (page) => page.getByRole('button', { name: /наблюдател/i }).first(),
    prepare: async (page) => {
      await page
        .getByRole('button', { name: /наблюдател/i })
        .first()
        .click();
      await page.getByRole('list', { name: 'Наблюдатели' }).waitFor();
    },
  },

  // --- Доска ---
  {
    article: 'board',
    name: 'board',
    user: 'anna',
    url: (state) => board(state),
    ready: (page) => page.getByText('Сверстать главную страницу').first(),
  },
  {
    article: 'board',
    name: 'quick-add',
    user: 'anna',
    url: (state) => board(state),
    ready: (page) => page.getByRole('button', { name: /Задача/ }).first(),
    prepare: async (page) => {
      await page
        .getByRole('button', { name: /Задача/ })
        .first()
        .click();
      await page.getByRole('textbox').first().fill('Подключить форму обратной связи');
    },
  },

  // --- Список задач ---
  {
    article: 'task-list',
    name: 'task-list',
    user: 'anna',
    url: `${W}/tasks`,
    ready: (page) => page.getByRole('table'),
  },
  {
    article: 'task-list',
    name: 'saved-views',
    user: 'anna',
    url: `${W}/tasks?priority=urgent,high&due=week`,
    ready: (page) => page.getByRole('button', { name: 'Срочное на неделе' }),
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Срочное на неделе' }).click();
      await page.getByRole('menuitem', { name: 'Сохранить текущий…' }).waitFor();
    },
  },
  {
    article: 'task-list',
    name: 'my-tasks',
    user: 'boris',
    url: '/my-tasks',
    ready: (page) => heading(page, 'Мои задачи'),
  },

  // --- Комментарии и вложения ---
  {
    article: 'comments-and-attachments',
    name: 'comments',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.safari}`,
    ready: (page) => region(page, 'Комментарии'),
    shot: (page) => region(page, 'Комментарии'),
  },
  {
    article: 'comments-and-attachments',
    name: 'mention',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.safari}`,
    ready: (page) => page.locator('#new-comment'),
    prepare: async (page) => {
      await page.locator('#new-comment').click();
      await page.keyboard.type('Посмотри, пожалуйста, @Бо');
      await page.getByRole('listbox').waitFor();
    },
  },
  {
    article: 'comments-and-attachments',
    name: 'attachments',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.home}`,
    ready: (page) => region(page, 'Вложения'),
    shot: (page) => region(page, 'Вложения'),
  },

  // --- Обзор ---
  {
    article: 'workspace-overview',
    name: 'overview',
    user: 'anna',
    url: `${W}/overview`,
    ready: (page) => page.getByText('Просроченные').first(),
    fullPage: true,
  },

  // --- Документы ---
  {
    article: 'documents',
    name: 'documents',
    user: 'boris',
    url: `${W}/docs`,
    ready: (page) => page.getByRole('list', { name: 'Папки и документы' }),
  },
  {
    article: 'documents',
    name: 'note',
    user: 'boris',
    url: (state) => `${W}/docs/${state.documents.brief}`,
    ready: (page) => page.getByRole('button', { name: 'Привязать к задаче' }),
  },
  {
    article: 'documents',
    name: 'note-editor',
    user: 'boris',
    url: (state) => `${W}/docs/${state.documents.release}/edit`,
    ready: (page) => page.getByLabel('Текст заметки (Markdown)'),
  },
  {
    article: 'documents',
    name: 'csv-viewer',
    user: 'boris',
    url: `${W}/docs`,
    ready: (page) => page.getByRole('list', { name: 'Папки и документы' }),
    prepare: async (page) => {
      await page
        .getByRole('list', { name: 'Папки и документы' })
        .getByText('budget', { exact: true })
        .click();
      await page.getByRole('table').waitFor();
    },
  },

  // --- Поиск и горячие клавиши ---
  {
    article: 'search-and-shortcuts',
    name: 'command-palette',
    user: 'anna',
    url: W,
    ready: (page) => heading(page, WORKSPACE.name),
    prepare: async (page) => {
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog').getByRole('combobox').fill('дизайн');
      await page.getByRole('option').first().waitFor();
    },
  },
  {
    article: 'search-and-shortcuts',
    name: 'shortcuts',
    user: 'anna',
    url: W,
    ready: (page) => heading(page, WORKSPACE.name),
    prepare: async (page) => {
      await page.keyboard.press('Shift+Slash');
      await page.getByRole('dialog', { name: 'Горячие клавиши' }).waitFor();
    },
  },

  // --- Пространства ---
  {
    article: 'workspaces',
    name: 'workspaces',
    user: 'anna',
    url: '/',
    ready: (page) => page.getByText(WORKSPACE.name).first(),
  },
  {
    article: 'workspaces',
    name: 'workspace-settings',
    user: 'anna',
    url: `${W}/settings`,
    ready: (page) => page.getByLabel('Ключ задач'),
    fullPage: true,
  },

  // --- Участники ---
  {
    article: 'members-and-access',
    name: 'members',
    user: 'anna',
    url: `${W}/settings/members`,
    ready: (page) => page.getByRole('table').first(),
    fullPage: true,
  },

  // --- Проекты и статусы ---
  {
    article: 'projects-and-statuses',
    name: 'projects',
    user: 'anna',
    url: W,
    ready: (page) => page.getByText('Мобильное приложение').first(),
  },
  {
    article: 'projects-and-statuses',
    name: 'project-settings',
    user: 'anna',
    url: (state) => `${W}/projects/${state.projects.site.id}/settings`,
    ready: (page) => page.getByRole('button', { name: 'Добавить статус' }),
    fullPage: true,
  },
  {
    article: 'projects-and-statuses',
    name: 'labels-settings',
    user: 'anna',
    url: `${W}/settings/labels`,
    ready: (page) => heading(page, 'Метки задач'),
  },

  // --- Агенты и токены ---
  {
    article: 'agents-and-tokens',
    name: 'agents',
    user: 'anna',
    url: `${W}/settings/agents`,
    ready: (page) => page.getByRole('link', { name: 'Claude — backend' }),
  },
  {
    article: 'agents-and-tokens',
    name: 'new-agent',
    user: 'anna',
    url: `${W}/settings/agents`,
    ready: (page) => page.getByRole('button', { name: 'Создать агента' }),
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Создать агента' }).click();
      await page.getByRole('dialog', { name: 'Новый агент' }).waitFor();
    },
    shot: (page) => page.getByRole('dialog'),
  },
  {
    article: 'agents-and-tokens',
    name: 'agent',
    user: 'anna',
    url: (state) => state.agentPath,
    ready: (page) => page.getByText('Токены агента'),
    fullPage: true,
  },
  {
    article: 'agents-and-tokens',
    name: 'personal-tokens',
    user: 'anna',
    url: '/profile/tokens',
    ready: (page) => page.getByText('Claude Code — ноутбук').first(),
  },
  {
    article: 'agents-and-tokens',
    name: 'token-activity',
    user: 'anna',
    url: '/profile/tokens',
    ready: (page) => tokenRow(page).getByRole('link', { name: 'Журнал' }),
    prepare: async (page) => {
      await tokenRow(page).getByRole('link', { name: 'Журнал' }).click();
      await page.getByText('add_comment').first().waitFor();
    },
  },
  {
    article: 'agents-and-tokens',
    name: 'via-agent',
    user: 'anna',
    url: (state) => `${W}/tasks/${state.tasks.analytics}`,
    ready: (page) => region(page, 'Комментарии'),
    shot: (page) => region(page, 'Комментарии'),
  },
  // claude-code-mcp/connect.png снимается при засеве (seed.mjs, tokens.personal): токен,
  // выпущенный ради кадра, остался бы в таблице отозванным.
];

/** Приглашённый, но ещё не вступивший пользователь — для кадра страницы приглашения. */
async function prepareGleb(browser, state, contexts) {
  if (state.inviteUrl && state.users.gleb) return;
  const anna = await contextPage(browser, contexts, 'anna');
  await anna
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await goto(anna, `${W}/settings/members`, anna.getByRole('table').first());
  const row = anna.getByRole('row').filter({ hasText: PENDING_INVITE_EMAIL });
  await row.getByRole('button', { name: 'Ссылка' }).click();
  state.inviteUrl = new URL(await anna.evaluate(() => navigator.clipboard.readText())).pathname;

  const gleb = await contextPage(browser, contexts, 'gleb');
  state.users.gleb = await signUpThroughIdp(gleb, {
    name: 'Глеб Орлов',
    email: PENDING_INVITE_EMAIL,
  });
}

async function contextPage(browser, contexts, user) {
  if (!contexts.has(user)) {
    const context = await newUserContext(browser, user === 'guest' ? 'guest-none' : user);
    contexts.set(user, { context, page: await context.newPage() });
  }
  return contexts.get(user).page;
}

export async function runShots(browser, state, { article, saveState } = {}) {
  const contexts = new Map();
  const list = SHOTS.filter((item) => !article || item.article === article);
  let count = 0;
  let bytes = 0;
  const failures = [];
  try {
    if (list.some((item) => item.user === 'gleb')) {
      await prepareGleb(browser, state, contexts);
      await saveState?.(state);
    }
    for (const item of list) {
      const page = await contextPage(browser, contexts, item.user);
      try {
        const url = typeof item.url === 'function' ? await item.url(state, page) : item.url;
        await goto(page, url, item.ready?.(page));
        await settle(page);
        await item.prepare?.(page, state);
        await settle(page, 300);
        bytes += await shoot(page, {
          article: item.article,
          name: item.name,
          locator: item.shot?.(page),
          mask: item.mask?.(page) ?? [],
          fullPage: item.fullPage,
        });
        count += 1;
        await item.cleanup?.(page);
        // Открытые диалоги и меню не переходят на следующий кадр.
        await page.keyboard.press('Escape');
      } catch (error) {
        const shot = await saveErrorShot(page, `shot-${item.article}-${item.name}`);
        const reason = error.message.split('\n')[0];
        failures.push(`${item.article}/${item.name}: ${reason}${shot ? ` (${shot})` : ''}`);
        log(`ОШИБКА ${item.article}/${item.name}: ${reason}`);
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  } finally {
    for (const [user, { context }] of contexts) {
      if (user !== 'guest') await saveUserState(context, user);
      await context.close();
    }
  }
  if (failures.length > 0) {
    throw new Error(`не сняты (${failures.length}):\n${failures.join('\n')}`);
  }
  return { count, bytes };
}
