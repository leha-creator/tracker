import { describe, expect, it } from 'vitest';

import { buildUploadCommand, humanSize } from '.';

describe('buildUploadCommand', () => {
  const slot = {
    attachmentId: 'a-1',
    url: 'https://tracker.example/tasker-attachments',
    fields: {
      key: 'ws/1/tasks/2/file',
      'Content-Type': 'text/plain',
      Policy: 'eyJhIjoiYiJ9+/=',
      'X-Amz-Signature': "o'clock",
    },
  };

  it('поля — --form-string в кавычках, файл последним, затем адрес', () => {
    const command = buildUploadCommand(slot, '/tmp/build error.txt');
    const lines = command.split('\n');
    expect(lines[0]).toBe('curl -sS --fail-with-body \\');
    expect(lines).toContain("  --form-string 'key=ws/1/tasks/2/file' \\");
    expect(lines).toContain("  --form-string 'Policy=eyJhIjoiYiJ9+/=' \\");
    expect(lines.at(-2)).toBe("  -F 'file=@/tmp/build error.txt' \\");
    expect(lines.at(-1)).toBe("  'https://tracker.example/tasker-attachments'");
  });

  it('одинарная кавычка в значении экранируется для shell', () => {
    expect(buildUploadCommand(slot)).toContain(`--form-string 'X-Amz-Signature=o'\\''clock'`);
  });

  it('по умолчанию — заглушка пути', () => {
    expect(buildUploadCommand(slot)).toContain("-F 'file=@<path-to-file>'");
  });
});

describe('humanSize', () => {
  it('байты, килобайты и мегабайты', () => {
    expect(humanSize(37)).toBe('37 B');
    expect(humanSize(1536)).toBe('1.5 KB');
    expect(humanSize(25 * 1024 * 1024)).toBe('25.0 MB');
  });
});
