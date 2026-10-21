// Засев демо-данных через интерфейс и HTTP API — те же сценарии, что описаны в справке.
// Шаги идут по порядку; выполненные отмечаются в .state/seed.json, поэтому после сбоя
// повторный запуск продолжает с упавшего шага.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { goto, newUserContext, saveErrorShot, saveUserState, shoot } from './browser.mjs';
import { prepareFixtures } from './fixtures.mjs';
import { signUpThroughIdp } from './idp.mjs';
import { BASE_URL, log, PENDING_INVITE_EMAIL, STATE_DIR, USERS, WORKSPACE } from './config.mjs';
import { isoDay, pickDueDate, pickSelect, waitForPath } from './ui.mjs';

const SEED_FILE = path.join(STATE_DIR, 'seed.json');

export async function loadSeedState() {
  try {
    return JSON.parse(await readFile(SEED_FILE, 'utf8'));
  } catch {
    return { done: [], users: {}, projects: {}, tasks: {} };
  }
}

export async function saveSeedState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(SEED_FILE, JSON.stringify(state, null, 2));
}

const W = `/w/${WORKSPACE.slug}`;

/** Контексты пользователей открываются по требованию и закрываются в конце. */
class Session {
  constructor(browser, state) {
    this.browser = browser;
    this.state = state;
    this.contexts = new Map();
    this.pages = new Map();
  }

  async page(userKey) {
    if (!this.pages.has(userKey)) {
      const context = await newUserContext(this.browser, userKey);
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
      this.contexts.set(userKey, context);
      this.pages.set(userKey, await context.newPage());
    }
    this.lastPage = this.pages.get(userKey);
    return this.lastPage;
  }

  async close() {
    for (const [userKey, context] of this.contexts) {
      await saveUserState(context, userKey);
      await context.close();
    }
  }
}

// --- шаги ------------------------------------------------------------------------------

/** Регистрация в IdP plwedding ID и первый вход в Tasker; cookie сессии остаются в контексте. */
async function signUpUsers(session) {
  for (const [key, user] of Object.entries(USERS)) {
    const page = await session.page(key);
    session.state.users[key] = await signUpThroughIdp(page, user);
    log(`seed: users — ${user.email}`);
  }
}

async function createWorkspace(session) {
  const page = await session.page('anna');
  await goto(page, '/?create=workspace');
  const panel = page.getByRole('dialog');
  await panel.getByLabel('Название').fill(WORKSPACE.name);
  await panel.getByLabel('Адрес').fill(WORKSPACE.slug);
  await panel.getByLabel('Ключ задач').fill(WORKSPACE.key);
  await panel.getByRole('button', { name: 'Создать', exact: true }).click();
  await waitForPath(page, new RegExp(`^${W}`));
  log(`seed: workspace — ${WORKSPACE.name}`);
}

const PROJECTS = [
  { key: 'site', name: 'Сайт', description: 'Новый сайт студии: дизайн, вёрстка, запуск' },
  { key: 'app', name: 'Мобильное приложение', description: 'Приложение для клиентов' },
  { key: 'marketing', name: 'Маркетинг', description: 'Контент, рассылки и соцсети' },
];

async function createProjects(session) {
  const page = await session.page('anna');
  for (const project of PROJECTS) {
    await goto(page, `${W}?create=project`);
    const panel = page.getByRole('dialog');
    await panel.getByLabel('Название').fill(project.name);
    await panel.getByLabel('Описание').fill(project.description);
    await panel.getByRole('button', { name: 'Создать проект' }).click();
    await waitForPath(page, /\/projects\/[0-9a-f-]{36}\//);
    const id = /\/projects\/([0-9a-f-]{36})\//.exec(new URL(page.url()).pathname)[1];
    session.state.projects[project.key] = { id, name: project.name };
    log(`seed: projects — ${project.name}`);
  }
}

/** Пятый статус «На ревью» в проекте «Сайт» — перед «Готово». */
async function addReviewStatus(session) {
  const page = await session.page('anna');
  const { id } = session.state.projects.site;
  await goto(
    page,
    `${W}/projects/${id}/settings`,
    page.getByRole('button', { name: 'Добавить статус' }),
  );
  const handle = page.getByRole('button', { name: 'Перетащить статус «На ревью»' });
  if (!(await handle.isVisible())) {
    await page.getByRole('button', { name: 'Добавить статус' }).click();
    await page.getByPlaceholder('Название статуса').fill('На ревью');
    await pickSelect(page, 'Категория нового статуса', 'В работе');
    await pickSelect(page, 'Цвет нового статуса', 'Фиолетовый');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await handle.waitFor();
  }
  // Клавиатурное перетаскивание dnd-kit: взять, на одну позицию вверх, положить. Сенсору
  // нужны паузы между нажатиями — он измеряет позиции после каждого шага.
  await handle.focus();
  for (const key of ['Space', 'ArrowUp', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  log('seed: statuses — «На ревью» в проекте «Сайт»');
}

/** Ссылка приглашения из кнопки «Ссылка» в строке ожидающего приглашения. */
async function copyInviteLink(page, email) {
  const row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('button', { name: 'Ссылка' }).click();
  return page.evaluate(() => navigator.clipboard.readText());
}

async function inviteMembers(session) {
  const anna = await session.page('anna');
  await goto(anna, `${W}/settings/members`);
  for (const email of [USERS.boris.email, USERS.vera.email, PENDING_INVITE_EMAIL]) {
    await anna.getByLabel('Email').fill(email);
    await anna.getByRole('button', { name: 'Пригласить', exact: true }).click();
    await anna.getByRole('row').filter({ hasText: email }).waitFor();
    log(`seed: invites — ${email}`);
  }
  for (const key of ['boris', 'vera']) {
    const url = await copyInviteLink(anna, USERS[key].email);
    const page = await session.page(key);
    await goto(page, url);
    await page.getByRole('button', { name: 'Принять приглашение' }).click();
    await waitForPath(page, new RegExp(`^${W}`));
    log(`seed: invites — ${USERS[key].email} принял приглашение`);
  }
  // Борис ведёт документацию: право «Управление документами».
  await goto(anna, `${W}/settings/members`);
  await anna.getByRole('switch', { name: `Управление документами: ${USERS.boris.name}` }).click();
  await anna.waitForTimeout(800);
  log('seed: members — Борису выдано «Управление документами»');
}

const LABELS = [
  { name: 'Баг', color: 'Красный' },
  { name: 'Дизайн', color: 'Фиолетовый' },
  { name: 'Срочно', color: 'Жёлтый' },
];

async function createLabels(session) {
  const page = await session.page('anna');
  await goto(page, `${W}/settings/labels`, page.getByPlaceholder('Новая метка'));
  for (const label of LABELS) {
    await page.getByPlaceholder('Новая метка').fill(label.name);
    await pickSelect(page, 'Цвет новой метки', label.color);
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.getByRole('textbox', { name: `Название метки «${label.name}»` }).waitFor();
    log(`seed: labels — ${label.name}`);
  }
}

/**
 * Задачи. `due` — смещение срока в днях от сегодня (отрицательное — просрочка), `parent` —
 * ключ родителя из этого списка, `project: null` — без проекта (подзадача только в дереве).
 */
const TASKS = [
  {
    key: 'home',
    title: 'Сверстать главную страницу',
    project: 'site',
    status: 'В работе',
    assignee: 'boris',
    priority: 'Высокий',
    due: 2,
    labels: ['Дизайн'],
    description:
      'Вёрстка по макету из Figma: шапка, блок услуг, кейсы и форма заявки. Адаптив до 360 px.',
  },
  {
    key: 'ds',
    title: 'Собрать дизайн-систему',
    project: 'site',
    status: 'В работе',
    assignee: 'vera',
    priority: 'Средний',
    due: 5,
    labels: ['Дизайн'],
    description: 'Общие цвета, шрифты и компоненты для сайта и приложения.',
  },
  {
    key: 'analytics',
    title: 'Настроить аналитику',
    project: 'site',
    status: 'К выполнению',
    assignee: 'boris',
    priority: 'Низкий',
    due: -3,
  },
  {
    key: 'safari',
    title: 'Форма заявки не отправляется в Safari',
    project: 'site',
    status: 'На ревью',
    assignee: 'boris',
    priority: 'Срочный',
    due: -1,
    labels: ['Баг', 'Срочно'],
    description:
      'В Safari 17 кнопка «Отправить» ничего не делает, в консоли ошибка валидации телефона.',
  },
  {
    key: 'about',
    title: 'Подготовить тексты для страницы «О нас»',
    project: 'site',
    status: 'К выполнению',
    assignee: 'anna',
    priority: 'Средний',
  },
  {
    key: 'hosting',
    title: 'Выбрать хостинг',
    project: 'site',
    status: 'Готово',
    assignee: 'anna',
    priority: 'Высокий',
  },
  {
    key: 'images',
    title: 'Оптимизировать изображения',
    project: 'site',
    status: 'К выполнению',
    assignee: 'vera',
    priority: 'Низкий',
    due: 12,
  },
  {
    key: 'ds-colors',
    title: 'Цвета и типографика',
    parent: 'ds',
    project: null,
    assignee: 'vera',
    priority: 'Средний',
  },
  {
    key: 'ds-controls',
    title: 'Кнопки и поля ввода',
    parent: 'ds',
    project: 'site',
    status: 'В работе',
    assignee: 'vera',
    priority: 'Средний',
    due: 4,
  },
  {
    key: 'ds-icons',
    title: 'Набор иконок',
    parent: 'ds',
    project: null,
    assignee: 'vera',
    priority: 'Низкий',
  },
  {
    key: 'login',
    title: 'Экран входа',
    project: 'app',
    status: 'В работе',
    assignee: 'boris',
    priority: 'Высокий',
    due: 4,
  },
  {
    key: 'push',
    title: 'Push-уведомления',
    project: 'app',
    status: 'К выполнению',
    assignee: 'boris',
    priority: 'Средний',
    due: 20,
  },
  {
    key: 'rotate',
    title: 'Приложение падает при повороте экрана',
    project: 'app',
    status: 'К выполнению',
    assignee: 'boris',
    priority: 'Срочный',
    due: -5,
    labels: ['Баг'],
  },
  {
    key: 'profile',
    title: 'Макеты профиля',
    project: 'app',
    status: 'Готово',
    assignee: 'vera',
    priority: 'Средний',
  },
  {
    key: 'mailing',
    title: 'Запустить рассылку для клиентов',
    project: 'marketing',
    status: 'В работе',
    assignee: 'anna',
    priority: 'Средний',
    due: 6,
  },
  {
    key: 'content',
    title: 'Контент-план на ноябрь',
    project: 'marketing',
    status: 'К выполнению',
    assignee: 'anna',
    priority: 'Высокий',
    due: 1,
  },
  {
    key: 'cases',
    title: 'Обновить кейсы в портфолио',
    project: 'marketing',
    status: 'Готово',
    assignee: 'vera',
    priority: 'Низкий',
  },
  {
    key: 'survey',
    title: 'Провести опрос клиентов',
    project: 'marketing',
    status: 'К выполнению',
    assignee: null,
    priority: 'Без приоритета',
  },
];

const taskHref = (number) => `${W}/tasks/${number}`;

/** Подшаг выполняется один раз: отметка в state.subSteps переживает перезапуск. */
async function once(session, id, fn) {
  session.state.subSteps ??= [];
  if (session.state.subSteps.includes(id)) return;
  await fn();
  session.state.subSteps.push(id);
  await saveSeedState(session.state);
}

async function fillTaskForm(page, session, task) {
  const parentNumber = task.parent ? session.state.tasks[task.parent] : undefined;
  await goto(
    page,
    `${W}/tasks/new${parentNumber ? `?parent=${parentNumber}` : ''}`,
    page.getByRole('button', { name: 'Создать задачу' }),
  );
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Создать задачу' }) });
  await form.locator('#new-task-title').fill(task.title);
  if (task.assignee) {
    await pickSelect(page, 'Ответственный', new RegExp(USERS[task.assignee].name), form);
  }
  if (task.due !== undefined) await pickDueDate(page, /^Срок/, isoDay(task.due), form);
  if (task.priority) await pickSelect(page, 'Приоритет', task.priority, form);
  if (task.project) {
    await pickSelect(page, 'Проект', session.state.projects[task.project].name, form);
    await pickSelect(page, 'Статус в проекте', task.status, form);
  }
  if (task.description)
    await form.getByRole('textbox', { name: 'Описание' }).fill(task.description);
  await form.getByRole('button', { name: 'Создать задачу' }).click();
  await waitForPath(page, new RegExp(`^${W}/tasks/\\d+`));
  return Number(/\/tasks\/(\d+)/.exec(new URL(page.url()).pathname)[1]);
}

/**
 * Метки в панели задачи: поиск в списке и отметка. Выбранные метки видны текстом в самой
 * кнопке «Метки» (у содержимого кнопки нет своих ролей) — по нему и проверяем.
 */
async function setTaskLabels(page, labels) {
  const trigger = page.getByRole('button', { name: /^Метки/ });
  const has = async (label) => ((await trigger.textContent()) ?? '').includes(label);
  await trigger.click();
  for (const label of labels) {
    if (await has(label)) continue;
    await page.getByPlaceholder('Найти или создать метку').fill(label);
    // cmdk ставит пунктам свою роль — ищем по атрибуту пункта и точному тексту.
    await page
      .locator('[cmdk-item]')
      .filter({ hasText: new RegExp('^' + label + '$') })
      .click();
    // Следующий клик — только после сохранения: иначе изменения перетирают друг друга.
    await page.waitForFunction(
      ([text]) =>
        [...document.querySelectorAll('button')].some(
          (b) => b.textContent?.includes(text) && b.getAttribute('aria-haspopup'),
        ),
      [label],
    );
    await page.waitForTimeout(800);
  }
  await page.keyboard.press('Escape');
}

/** Ввод в поле комментария с @упоминанием: «@Имя» выбирается из подсказки. */
async function typeComment(page, parts) {
  const field = page.locator('#new-comment');
  await field.click();
  for (const part of parts) {
    if (part.mention) {
      await field.pressSequentially(`@${part.mention.slice(0, 3)}`, { delay: 30 });
      await page
        .getByRole('listbox', { name: 'Упомянуть участника' })
        .getByRole('option', { name: new RegExp(part.mention) })
        .click();
    } else {
      await field.pressSequentially(part.text, { delay: 5 });
    }
  }
}

async function sendComment(page, parts, files = []) {
  await typeComment(page, parts);
  if (files.length > 0) {
    const form = page.locator('form').filter({ has: page.locator('#new-comment') });
    await form.locator('input[type="file"]').setInputFiles(files);
    await form.getByRole('button', { name: 'Отправить' }).waitFor();
  }
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  // Комментарий появился в ленте — по началу последнего фрагмента текста.
  const snippet = parts
    .findLast((part) => part.text)
    ?.text.trim()
    .slice(0, 30);
  await page.getByRole('listitem').filter({ hasText: snippet }).first().waitFor();
}

async function taskDetails(session, fixtures) {
  const { tasks, projects } = session.state;
  const anna = await session.page('anna');

  await once(session, 'details.labels', async () => {
    await goto(anna, taskHref(tasks.safari), anna.getByRole('button', { name: /^Метки/ }));
    await setTaskLabels(anna, ['Баг', 'Срочно']);
    log('seed: details — метки SEV-4');
  });

  await once(session, 'details.two-projects', async () => {
    await goto(
      anna,
      taskHref(tasks.about),
      anna.getByRole('button', { name: 'Добавить в проект' }),
    );
    await anna.getByRole('button', { name: 'Добавить в проект' }).click();
    await pickSelect(anna, 'Проект', projects.marketing.name);
    await pickSelect(anna, 'Статус в новом проекте', 'В работе');
    await anna.getByRole('button', { name: 'Добавить', exact: true }).click();
    await anna
      .getByRole('combobox', { name: `Статус в проекте «${projects.marketing.name}»` })
      .waitFor();
    log('seed: details — задача «О нас» в двух проектах');
  });

  await once(session, 'details.attachments', async () => {
    await goto(anna, taskHref(tasks.home), anna.getByRole('button', { name: 'Прикрепить файлы' }));
    await anna
      .locator('section, div')
      .filter({ has: anna.getByRole('button', { name: 'Прикрепить файлы' }) })
      .last()
      .locator('input[type="file"]')
      .setInputFiles([fixtures.mockup, fixtures.brief]);
    await anna.getByText('brief.pdf').first().waitFor();
    await anna.waitForTimeout(2000);
    log('seed: details — вложения к главной странице');
  });

  // Обсуждение бага: Борис упоминает Анну и прикладывает скриншот, Анна отвечает.
  await once(session, 'details.comment-boris', async () => {
    const boris = await session.page('boris');
    await goto(boris, taskHref(tasks.safari), boris.locator('#new-comment'));
    await sendComment(
      boris,
      [
        { mention: USERS.anna.name },
        {
          text: ' нашёл причину: маска телефона ломает валидацию в Safari. Исправление в ветке sev-4-safari-form, посмотри, пожалуйста.',
        },
      ],
      [fixtures.mockup],
    );
    log('seed: details — комментарий Бориса');
  });
  await once(session, 'details.comment-anna', async () => {
    await goto(anna, taskHref(tasks.safari), anna.locator('#new-comment'));
    await sendComment(anna, [
      { text: 'Спасибо! Проверила на iPhone — форма отправляется. Можно сливать.' },
    ]);
    log('seed: details — ответ Анны');
  });

  await once(session, 'details.watch', async () => {
    const vera = await session.page('vera');
    await goto(vera, taskHref(tasks.safari), vera.getByRole('button', { name: /Наблюдателей/ }));
    await vera.getByRole('button', { name: /Наблюдателей/ }).click();
    await vera.getByRole('button', { name: 'Следить за задачей' }).click();
    await vera.getByRole('button', { name: 'Перестать следить' }).waitFor();
    await vera.keyboard.press('Escape');
    log('seed: details — Вера следит за SEV-4');
  });

  // Архивная задача — для статьи об архиве.
  await once(session, 'details.archive', async () => {
    const number = await fillTaskForm(anna, session, {
      title: 'Старый лендинг акции',
      project: 'marketing',
      status: 'Готово',
      assignee: 'anna',
      priority: 'Низкий',
    });
    tasks.oldLanding = number;
    await saveSeedState(session.state);
    await anna
      .getByRole('button', { name: `Действия с задачей ${WORKSPACE.key}-${number}` })
      .click();
    await anna.getByRole('menuitem', { name: 'В архив' }).click();
    await anna.getByRole('button', { name: 'Восстановить' }).first().waitFor();
    log(`seed: details — ${WORKSPACE.key}-${number} в архиве`);
  });
}

const DOC_TAGS = [
  { name: 'Регламент', color: 'Синий' },
  { name: 'Дизайн', color: 'Фиолетовый' },
  { name: 'Финансы', color: 'Зелёный' },
];

const RELEASE_NOTE = `# Регламент релизов

Релиз сайта выходит по вторникам. Ответственный за релиз — разработчик задачи.

## Перед релизом

- [x] Все задачи релиза в статусе «На ревью»
- [x] Изменения проверены на iPhone и Android
- [ ] Обновлён список изменений

## Откат

Если после релиза что-то сломалось, откатываемся на прошлую версию и заводим задачу с меткой «Баг».
`;

const BRIEF_NOTE = `# Бриф: новый сайт

| Раздел | Что показываем | Готовность |
| --- | --- | --- |
| Главная | Услуги и кейсы | макет |
| Услуги | Цены и сроки | тексты |
| Кейсы | 6 проектов | сбор материалов |

Тон — спокойный и деловой, без восклицательных знаков. Главный призыв — «Обсудить проект».
`;

const docsHref = (query = '') => `${W}/docs${query}`;

/** id документа из адреса /docs/<id>. */
const documentIdFrom = (page) => /\/docs\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];

async function createNote(page, { title, folder, content }) {
  await goto(page, `${W}/docs/new`, page.getByLabel('Название'));
  await page.getByLabel('Название').fill(title);
  if (folder) await pickSelect(page, 'Папка', folder);
  await page.getByLabel('Текст заметки (Markdown)').fill(content);
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await page.waitForURL(
    (url) => /\/docs\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
  );
  return documentIdFrom(page);
}

async function seedDocuments(session, fixtures) {
  const boris = await session.page('boris');
  const docs = (session.state.documents ??= {});

  await once(session, 'docs.tags', async () => {
    await goto(boris, docsHref(), boris.getByRole('button', { name: 'Теги', exact: true }));
    await boris.getByRole('button', { name: 'Теги', exact: true }).click();
    const dialog = boris.getByRole('dialog');
    const form = dialog.locator('form:has([placeholder="Новый тег"])');
    for (const tag of DOC_TAGS) {
      const existing = dialog.getByRole('textbox', { name: `Название тега «${tag.name}»` });
      if (await existing.isVisible()) continue;
      await form.getByPlaceholder('Новый тег').fill(tag.name);
      await form.getByRole('radio', { name: tag.color }).click();
      await form.getByRole('button', { name: 'Добавить', exact: true }).click();
      await dialog.getByRole('textbox', { name: `Название тега «${tag.name}»` }).waitFor();
    }
    await boris.keyboard.press('Escape');
    log('seed: docs — теги');
  });

  await once(session, 'docs.folders', async () => {
    for (const name of ['Дизайн', 'Процессы']) {
      await goto(boris, docsHref(), boris.getByRole('button', { name: 'Создать' }));
      await boris.getByRole('button', { name: 'Создать' }).click();
      await boris.getByRole('menuitem', { name: 'Папка' }).click();
      const dialog = boris.getByRole('dialog', { name: 'Новая папка' });
      await dialog.getByLabel('Название').fill(name);
      await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
      await boris.getByRole('navigation', { name: 'Папки документов' }).getByText(name).waitFor();
    }
    log('seed: docs — папки');
  });

  await once(session, 'docs.notes', async () => {
    docs.release = await createNote(boris, {
      title: 'Регламент релизов',
      folder: 'Процессы',
      content: RELEASE_NOTE,
    });
    docs.brief = await createNote(boris, {
      title: 'Бриф: новый сайт',
      folder: 'Дизайн',
      content: BRIEF_NOTE,
    });
    await saveSeedState(session.state);
    log('seed: docs — заметки');
  });

  await once(session, 'docs.uploads', async () => {
    await goto(boris, docsHref(), boris.getByRole('button', { name: 'Создать' }));
    await boris
      .locator('input[type="file"]')
      .first()
      .setInputFiles([fixtures.budget, fixtures.mockup]);
    await boris
      .getByRole('list', { name: 'Папки и документы' })
      .getByText('budget', { exact: true })
      .waitFor({ timeout: 30_000 });
    await boris
      .getByRole('list', { name: 'Папки и документы' })
      .getByText('mockup', { exact: true })
      .waitFor({ timeout: 30_000 });
    // Название документа — имя файла без расширения.
    log('seed: docs — загружены budget.csv и mockup.png');
  });

  await once(session, 'docs.tag-assign', async () => {
    for (const [id, tag] of [
      [docs.release, 'Регламент'],
      [docs.brief, 'Дизайн'],
    ]) {
      await goto(boris, `${W}/docs/${id}`, boris.getByRole('button', { name: 'Другие действия' }));
      await boris.getByRole('button', { name: 'Другие действия' }).click();
      await boris.getByRole('menuitem', { name: 'Теги' }).click();
      const dialog = boris.getByRole('dialog');
      await dialog.getByRole('checkbox', { name: tag }).click();
      await dialog.getByRole('button', { name: 'Сохранить' }).click();
      await dialog.waitFor({ state: 'detached' });
    }
    log('seed: docs — теги документов');
  });

  await once(session, 'docs.link', async () => {
    const { tasks } = session.state;
    await goto(
      boris,
      `${W}/docs/${docs.brief}`,
      boris.getByRole('button', { name: 'Привязать к задаче' }),
    );
    await boris.getByRole('button', { name: 'Привязать к задаче' }).click();
    await boris.getByPlaceholder('Номер (#42) или название').fill(`#${tasks.home}`);
    await boris.locator('[cmdk-item]').filter({ hasText: 'Сверстать главную страницу' }).click();
    await boris
      .getByRole('button', { name: `Отвязать от задачи ${WORKSPACE.key}-${tasks.home}` })
      .waitFor();
    log('seed: docs — бриф привязан к главной странице');
  });
}

async function createTasks(session) {
  const page = await session.page('anna');
  for (const task of TASKS) {
    if (session.state.tasks[task.key]) continue;
    const number = await fillTaskForm(page, session, task);
    session.state.tasks[task.key] = number;
    await saveSeedState(session.state);
    if (task.labels) await setTaskLabels(page, task.labels);
    log(`seed: tasks — ${WORKSPACE.key}-${number} ${task.title}`);
  }
}

async function saveTaskView(session) {
  const page = await session.page('anna');
  await goto(
    page,
    `${W}/tasks?priority=urgent,high&due=week`,
    page.getByRole('button', { name: 'Фильтры', exact: true }),
  );
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Сохранить текущий…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Сохранить фильтр' });
  await dialog.getByLabel('Название фильтра').fill('Срочное на неделе');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  log('seed: views — «Срочное на неделе»');
}

/** Выпуск токена в открытом диалоге «Создать токен»; возвращает секрет из блока «Токен». */
async function issueToken(page, name, { scopes, shot } = {}) {
  await page.getByRole('button', { name: 'Создать токен' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название').fill(name);
  for (const scope of ['Задачи', 'Документы']) {
    await dialog.getByRole('checkbox', { name: scope }).setChecked(scopes.includes(scope));
  }
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  const secret = dialog.locator('pre').first();
  await secret.waitFor();
  const value = (await secret.textContent()).trim();
  // Окно с командой подключения показывается один раз — снимок делается сразу, а токен
  // в тексте заменяется заглушкой: на кадре видны команды, но не секрет.
  if (shot) {
    await dialog.locator('pre').evaluateAll((nodes, token) => {
      for (const node of nodes)
        node.textContent = node.textContent.replaceAll(token, 'tkr_••••••••');
    }, value);
    await shoot(page, { ...shot, locator: dialog });
  }
  await dialog.getByRole('button', { name: 'Готово' }).click();
  await dialog.waitFor({ state: 'detached' });
  return value;
}

/** Вызов инструмента MCP-сервера Tasker по токену — так работает Claude Code. */
async function callMcpTool(token, name, args) {
  const response = await fetch(new URL('/api/mcp', BASE_URL), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error || body?.result?.isError) {
    throw new Error(`MCP ${name}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function seedAgents(session) {
  const page = await session.page('anna');
  const { tasks } = session.state;
  const tokens = (session.state.tokens ??= {});
  const key = (number) => `${WORKSPACE.key}-${number}`;

  await once(session, 'agents.create', async () => {
    await goto(page, `${W}/settings/agents`, page.getByRole('button', { name: 'Создать агента' }));
    await page.getByRole('button', { name: 'Создать агента' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новый агент' });
    await dialog.getByLabel('Название').fill('Claude — backend');
    await dialog.getByLabel('Описание').fill('Репозиторий studio-site: API, вёрстка, CI');
    await pickSelect(page, 'Ответственный', USERS.boris.name, dialog);
    await dialog.getByLabel('Управление документами').check();
    await dialog.getByRole('button', { name: 'Создать агента' }).click();
    await dialog.waitFor({ state: 'detached' });
    log('seed: agents — «Claude — backend»');
  });

  await once(session, 'agents.token', async () => {
    await goto(page, `${W}/settings/agents`, page.getByRole('link', { name: 'Claude — backend' }));
    await page.getByRole('link', { name: 'Claude — backend' }).click();
    await page.getByRole('button', { name: 'Создать токен' }).waitFor();
    session.state.agentPath = new URL(page.url()).pathname;
    tokens.agent = await issueToken(page, 'Ноутбук Бориса', { scopes: ['Задачи', 'Документы'] });
    await saveSeedState(session.state);
    log('seed: agents — токен агента');
  });

  await once(session, 'agents.mcp', async () => {
    await callMcpTool(tokens.agent, 'add_comment', {
      task: key(tasks.push),
      body: 'Взял в работу: подключаю Firebase Cloud Messaging, ветка sev-12-push. Пуши для Android будут в первом PR, iOS — во втором.',
    });
    log('seed: agents — комментарий агента через MCP');
  });

  await once(session, 'tokens.personal', async () => {
    await goto(page, '/profile/tokens', page.getByRole('button', { name: 'Создать токен' }));
    tokens.personal = await issueToken(page, 'Claude Code — ноутбук', {
      scopes: ['Задачи'],
      shot: { article: 'claude-code-mcp', name: 'connect' },
    });
    await saveSeedState(session.state);
    log('seed: tokens — личный токен Анны');
  });

  await once(session, 'tokens.mcp', async () => {
    await callMcpTool(tokens.personal, 'add_comment', {
      task: key(tasks.analytics),
      body: 'Проверила счётчики: цели «Заявка» и «Звонок» срабатывают, данные идут в отчёт с сегодняшнего дня.',
    });
    log('seed: tokens — комментарий через личный токен');
  });
}

export const SEED_STEPS = [
  ['users', signUpUsers],
  ['workspace', createWorkspace],
  ['projects', createProjects],
  ['statuses', addReviewStatus],
  ['members', inviteMembers],
  ['labels', createLabels],
  ['tasks', createTasks],
  ['details', taskDetails],
  ['documents', seedDocuments],
  ['views', saveTaskView],
  ['agents', seedAgents],
];

export async function runSeed(browser, { only } = {}) {
  const state = await loadSeedState();
  const session = new Session(browser, state);
  const fixtures = await prepareFixtures(browser);
  try {
    for (const [name, step] of SEED_STEPS) {
      if (state.done.includes(name)) continue;
      if (only && name !== only) continue;
      log(`seed: ${name}…`);
      try {
        await step(session, fixtures);
      } catch (error) {
        const page = session.lastPage;
        const shot = await saveErrorShot(page, `seed-${name}`);
        throw new Error(
          `шаг засева «${name}» (${page?.url() ?? '-'}): ${error.message}${shot ? `\nснимок: ${shot}` : ''}`,
          { cause: error },
        );
      }
      state.done.push(name);
      await saveSeedState(state);
    }
  } finally {
    await saveSeedState(state);
    await session.close();
  }
  return state;
}
