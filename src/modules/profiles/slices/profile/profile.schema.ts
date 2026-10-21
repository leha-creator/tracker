import { z } from 'zod';

import {
  normalizeProfileBio,
  normalizeProfileLine,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_POSITION_MAX_LENGTH,
} from '../../models/profile';

export const updateProfileSchema = z.object({
  position: z
    .string()
    .default('')
    .transform(normalizeProfileLine)
    .pipe(
      z
        .string()
        .max(
          PROFILE_POSITION_MAX_LENGTH,
          `Должность — не больше ${PROFILE_POSITION_MAX_LENGTH} символов`,
        ),
    ),
  bio: z
    .string()
    .default('')
    .transform(normalizeProfileBio)
    .pipe(
      z
        .string()
        .max(PROFILE_BIO_MAX_LENGTH, `Описание — не больше ${PROFILE_BIO_MAX_LENGTH} символов`),
    ),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
