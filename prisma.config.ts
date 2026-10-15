import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Пустая строка допустима для `prisma generate` без .env (например, в postinstall на CI).
    url: process.env.DATABASE_URL ?? '',
  },
});
