export const PROFILE_NAME_MIN_LENGTH = 2;
export const PROFILE_NAME_MAX_LENGTH = 80;
export const PROFILE_POSITION_MAX_LENGTH = 80;
export const PROFILE_BIO_MAX_LENGTH = 1000;

/** Однострочное поле: без пробелов по краям, повторные пробелы схлопнуты. */
export function normalizeProfileLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Описание «о себе»: переводы строк `\n`, без пробелов в конце строк и по краям, не больше одной
 * пустой строки подряд.
 */
export function normalizeProfileBio(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Пустая строка — значение не задано. */
export function emptyToNull(value: string): string | null {
  return value === '' ? null : value;
}
