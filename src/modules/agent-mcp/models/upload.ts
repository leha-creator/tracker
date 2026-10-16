/** Слот загрузки presigned POST: адрес хранилища и поля политики. */
export interface UploadSlot {
  attachmentId: string;
  url: string;
  fields: Record<string, string>;
}

/** Размер для людей: `512 B`, `1.5 KB`, `3.2 MB`. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** В одинарных кавычках shell: `'` → `'\''`. Значения политики — base64 и ключи, но на всякий случай. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Команда `curl` для загрузки файла по presigned POST. Поля — `--form-string`
 * (значение не разбирается как `@файл`), файл — последним полем, как требует S3.
 */
export function buildUploadCommand(slot: UploadSlot, filePath = '<path-to-file>'): string {
  const fields = Object.entries(slot.fields).map(
    ([name, value]) => `  --form-string ${shellQuote(`${name}=${value}`)} \\`,
  );
  return [
    'curl -sS --fail-with-body \\',
    ...fields,
    `  -F ${shellQuote(`file=@${filePath}`)} \\`,
    `  ${shellQuote(slot.url)}`,
  ].join('\n');
}
