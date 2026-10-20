// Мелкие действия в интерфейсе Tasker: селекты radix, срок, тосты. Селекторы — по ролям и
// подписям из компонентов: если подпись в UI поменялась, скрипт падает на понятном месте.

/** Выбрать значение в radix Select: триггер — combobox с доступным именем. */
export async function pickSelect(page, comboboxName, optionName, scope = page) {
  await scope.getByRole('combobox', { name: comboboxName, exact: true }).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

/**
 * Срок в поле `DueDatePicker`: кнопка → поле даты → blur. `iso` — YYYY-MM-DD. Enter не годится:
 * поле открывает системный выбор даты, и Enter выбирает в нём сегодняшний день.
 */
export async function pickDueDate(page, buttonName, iso, scope = page) {
  await scope.getByRole('button', { name: buttonName }).first().click();
  const input = scope.locator('input[type="date"]');
  await input.fill(iso);
  await input.evaluate((element) => element.blur());
  await input.waitFor({ state: 'detached' });
}

/** Дата относительно сегодняшней в формате YYYY-MM-DD (локальное время). */
export function isoDay(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Ждать, пока адрес совпадёт с шаблоном (после редиректа Server Action). */
export async function waitForPath(page, pattern) {
  await page.waitForURL((url) => pattern.test(url.pathname + url.search));
}
