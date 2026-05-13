import { z } from 'zod';

export const kioskActiveSessionBodySchema = z.object({
  computerId: z.string().min(1),
  /** Account username (kiosk treats this as phone number). */
  phone: z.string().min(1),
  password: z.string().min(1),
});

export type KioskActiveSessionBody = z.infer<typeof kioskActiveSessionBodySchema>;
