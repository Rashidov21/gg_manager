import { z } from 'zod';

export const startSessionSchema = z.object({
  computerId: z.string().min(1),
  accountId: z.string().min(1),
  requestedMinutes: z.number().int().positive(),
  zone: z.string().min(1).optional(),
});

export type StartSessionDto = z.infer<typeof startSessionSchema>;

export const extendSessionSchema = z.object({
  sessionId: z.string().min(1),
  additionalMinutes: z.number().int().positive(),
});

export type ExtendSessionDto = z.infer<typeof extendSessionSchema>;

