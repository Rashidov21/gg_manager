import { z } from 'zod';

export const adminCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('startSession'),
    commandId: z.string().min(1),
    computerId: z.string().min(1),
    accountId: z.string().min(1),
    requestedMinutes: z.number().int().positive(),
    zone: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('extendTime'),
    commandId: z.string().min(1),
    sessionId: z.string().min(1),
    additionalMinutes: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('lock'),
    commandId: z.string().min(1),
    computerId: z.string().min(1),
  }),
  z.object({
    type: z.literal('reboot'),
    commandId: z.string().min(1),
    computerId: z.string().min(1),
  }),
]);

export type AdminCommand = z.infer<typeof adminCommandSchema>;

export type CommandResultStatus = 'pending' | 'sent' | 'acked' | 'failed';

export type CommandResult = {
  commandId: string;
  computerId: string;
  status: CommandResultStatus;
  error?: string | undefined;
};
