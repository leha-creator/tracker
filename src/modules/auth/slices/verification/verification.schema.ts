import { z } from 'zod';

import { emailField, returnToField } from '../credentials/credentials.schema';

export const resendVerificationSchema = z.object({
  email: emailField,
  returnTo: returnToField,
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
