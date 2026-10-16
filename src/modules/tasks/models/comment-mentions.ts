/** Участник пространства, которого можно упомянуть через `@`. */
export interface MentionCandidate {
  userId: string;
  name: string;
  email: string;
  image?: string | null;
  /** Агент пространства: в подсказке — «(агент)» вместо служебного email. */
  isAgent?: boolean;
}

/** Упоминание в тексте: `body.slice(start, end)` — `@Имя`. */
export interface MentionRange {
  start: number;
  end: number;
  userId: string;
}

/** Запрос после `@` под курсором: позиция `@` и набранный текст. */
export interface MentionQuery {
  start: number;
  query: string;
}

/** Длина запроса после `@`, дальше подсказка не ищет. */
export const MENTION_QUERY_MAX_LENGTH = 40;
/** Сколько участников показывать в подсказке. */
export const MENTION_SUGGESTIONS_LIMIT = 8;

const WORD_CHAR = /[\p{L}\p{N}_]/u;
/** Символы запроса: буквы, цифры, точка, дефис, подчёркивание и пробел (имя и фамилия). */
const QUERY_CHARS = /^[\p{L}\p{N}._\- ]*$/u;

/** Без регистра и различия «ё/е»; длина строки не меняется. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е');
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

/** `@` начинает упоминание в начале текста или после не-буквы (так `user@mail` — не упоминание). */
function canStartMention(text: string, index: number): boolean {
  return text[index] === '@' && !isWordChar(text[index - 1]);
}

function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * Упоминание, которое пользователь набирает сейчас: от ближайшего `@` слева от курсора до
 * курсора. Перевод строки, второй пробел подряд или чужие символы обрывают запрос.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const from = Math.max(0, caret - MENTION_QUERY_MAX_LENGTH - 1);
  for (let index = caret - 1; index >= from; index -= 1) {
    const char = text[index];
    if (char === '\n') return null;
    if (char !== '@') continue;
    if (!canStartMention(text, index)) return null;
    const query = text.slice(index + 1, caret);
    if (!QUERY_CHARS.test(query) || query.startsWith(' ') || query.includes('  ')) return null;
    if ((query.match(/ /g)?.length ?? 0) > 1) return null;
    return { start: index, query };
  }
  return null;
}

function rankCandidate(candidate: MentionCandidate, query: string): number | null {
  if (query === '') return 0;
  const name = normalize(candidate.name);
  // Служебный email агента (agent-<id>@…) в поиске не участвует — только имя.
  const email = candidate.isAgent ? '' : normalize(candidate.email);
  if (name.startsWith(query)) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 1;
  if (emailLocalPart(email).startsWith(query)) return 2;
  if (name.includes(query) || email.includes(query)) return 3;
  return null;
}

/**
 * Подсказка по набранному запросу: сначала совпадение начала имени, потом начала любого слова
 * имени, потом начала email, потом вхождение. Внутри группы — по имени.
 */
export function filterMentionCandidates<T extends MentionCandidate>(
  members: readonly T[],
  query: string,
  limit = MENTION_SUGGESTIONS_LIMIT,
): T[] {
  const normalized = normalize(query.trim());
  return members
    .flatMap((member) => {
      const rank = rankCandidate(member, normalized);
      return rank === null ? [] : [{ member, rank }];
    })
    .sort((a, b) => a.rank - b.rank || a.member.name.localeCompare(b.member.name, 'ru'))
    .slice(0, limit)
    .map(({ member }) => member);
}

/** Текст, который вставляется при выборе участника из подсказки. */
export function mentionText(member: Pick<MentionCandidate, 'name'>): string {
  return `@${member.name} `;
}

/**
 * Упоминания в тексте комментария. После каждого `@` на границе слова ищется самое длинное
 * совпадение с именем участника или локальной частью его email (без учёта регистра и «ё/е»);
 * за совпадением не должна идти буква или цифра. Так одинаково работают выбор из подсказки и
 * ручной ввод.
 */
export function extractMentions(
  body: string,
  members: readonly MentionCandidate[],
): MentionRange[] {
  if (members.length === 0 || !body.includes('@')) return [];
  const text = normalize(body);
  const variants = members.flatMap((member) =>
    [member.name, emailLocalPart(member.email)]
      .map((value) => normalize(value.trim()))
      .filter((value) => value !== '')
      .map((value) => ({ value, userId: member.userId })),
  );

  const ranges: MentionRange[] = [];
  for (let index = text.indexOf('@'); index !== -1; index = text.indexOf('@', index + 1)) {
    if (!canStartMention(text, index)) continue;
    let best: { length: number; userId: string } | null = null;
    for (const variant of variants) {
      const end = index + 1 + variant.value.length;
      if (!text.startsWith(variant.value, index + 1) || isWordChar(text[end])) continue;
      if (!best || variant.value.length > best.length) {
        best = { length: variant.value.length, userId: variant.userId };
      }
    }
    if (best) {
      const end = index + 1 + best.length;
      ranges.push({ start: index, end, userId: best.userId });
      index = end - 1;
    }
  }
  return ranges;
}

/** Уникальные id упомянутых участников в порядке первого упоминания. */
export function mentionedUserIds(body: string, members: readonly MentionCandidate[]): string[] {
  return [...new Set(extractMentions(body, members).map((range) => range.userId))];
}

/**
 * Получатели уведомлений о комментарии. Упомянутые — те, кого нет среди прежних упоминаний
 * (при правке уведомляются только новые). Наблюдатели (ответственный и автор задачи) — только
 * для нового комментария и если их не упомянули. Автор комментария исключается везде.
 */
export function resolveCommentRecipients(input: {
  actorId: string;
  mentioned: readonly string[];
  previouslyMentioned?: readonly string[];
  watchers?: readonly (string | null)[];
}): { mentions: string[]; watchers: string[] } {
  const previous = new Set(input.previouslyMentioned ?? []);
  const mentions = [...new Set(input.mentioned)].filter(
    (userId) => userId !== input.actorId && !previous.has(userId),
  );
  const mentionedNow = new Set(input.mentioned);
  const watchers = [...new Set((input.watchers ?? []).filter((userId) => userId !== null))].filter(
    (userId) => userId !== input.actorId && !mentionedNow.has(userId),
  );
  return { mentions, watchers };
}
