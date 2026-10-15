import { fileURLToPath } from 'node:url';

import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` бросает исключение вне React Server Components — в тестах подменяем пустышкой.
      'server-only': fileURLToPath(new URL('./src/test/server-only-mock.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Тестовое окружение: логи выключены, сервисы не нужны.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_BUCKET: 'test-bucket',
      BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
  },
});
