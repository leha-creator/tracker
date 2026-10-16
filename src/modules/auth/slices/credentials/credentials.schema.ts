import { z } from 'zod';

/** Совпадают с настройками Better Auth в src/shared/auth/auth.ts. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailField = z
  .string({ error: 'Укажите email' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Некорректный email' }).max(254, { error: 'Слишком длинный email' }));

export const returnToField = z.string().optional();

export const signInSchema = z.object({
  email: emailField,
  password: z
    .string({ error: 'Введите пароль' })
    .min(1, { error: 'Введите пароль' })
    .max(PASSWORD_MAX_LENGTH, { error: `Пароль не длиннее ${PASSWORD_MAX_LENGTH} символов` }),
  returnTo: returnToField,
});

export const signUpSchema = z
  .object({
    name: z
      .string({ error: 'Укажите имя' })
      .trim()
      .min(1, { error: 'Укажите имя' })
      .max(100, { error: 'Имя не длиннее 100 символов' }),
    email: emailField,
    password: z
      .string({ error: 'Введите пароль' })
      .min(PASSWORD_MIN_LENGTH, { error: `Пароль не короче ${PASSWORD_MIN_LENGTH} символов` })
      .max(PASSWORD_MAX_LENGTH, { error: `Пароль не длиннее ${PASSWORD_MAX_LENGTH} символов` }),
    confirmPassword: z.string({ error: 'Повторите пароль' }),
    returnTo: returnToField,
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
