import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

// Запрет прямого доступа к БД из слоя представления (см. .ai-factory/ARCHITECTURE.md).
const NO_DB_IN_PRESENTATION = [
  {
    group: ['@prisma/client', '@prisma/client/*', '@/generated/prisma', '@/generated/prisma/*'],
    message: 'Слой представления не обращается к Prisma. Используйте публичный API модуля.',
  },
  {
    group: ['@/shared/db', '@/shared/db/*'],
    message: 'Слой представления не обращается к БД. Используйте публичный API модуля.',
  },
  {
    group: ['**/*.repository', '**/*.repository.ts'],
    message: 'Репозитории доступны только сервисам своего модуля.',
  },
];

// Импорт модуля снаружи — только через его index.ts.
const NO_DEEP_MODULE_IMPORTS = [
  {
    // `**` — и для вложенных модулей (integrations/github).
    group: [
      '@/modules/*/slices/**',
      '@/modules/*/models/**',
      '@/modules/**/slices/**',
      '@/modules/**/models/**',
    ],
    message: 'Импортируйте модуль только через его публичный API: @/modules/<module>.',
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Типизированные правила для исходников приложения.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Слой представления: app/ и общие компоненты.
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...NO_DB_IN_PRESENTATION, ...NO_DEEP_MODULE_IMPORTS] },
      ],
    },
  },

  // shared/ не лезет во внутренности модулей.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: NO_DEEP_MODULE_IMPORTS }],
    },
  },

  // Доменные модели — чистый TypeScript без инфраструктуры.
  {
    files: ['src/modules/*/models/**/*.ts', 'src/modules/**/models/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@prisma/*',
                '@/generated/prisma',
                '@/generated/prisma/*',
                '@/shared/db',
                '@/shared/db/*',
              ],
              message: 'Модели не зависят от Prisma и БД.',
            },
            {
              group: ['next', 'next/*', 'react', 'react-dom'],
              message: 'Модели не зависят от Next.js и React.',
            },
            {
              group: ['**/*.service', '**/*.repository'],
              message: 'Модели не импортируют сервисы и репозитории.',
            },
          ],
        },
      ],
    },
  },

  // Сгенерированные shadcn-компоненты не правим вручную.
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },

  // Тесты и конфиги.
  {
    files: ['**/*.test.ts', '*.config.{ts,mjs}', 'prisma.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  prettier,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'src/generated/**',
    '.ai-factory/**',
    '.claude/**',
  ]),
]);

export default eslintConfig;
