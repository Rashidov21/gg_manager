import { z } from 'zod';

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('register'),
    computerId: z.string().min(1),
  }),
  z.object({
    type: z.literal('heartbeat'),
    computerId: z.string().min(1),
    localTimestamp: z.string().optional(),
    remainingMinutes: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('snapshot'),
    computerId: z.string().min(1),
    cpuUsage: z.number().optional(),
    cpuTemp: z.number().optional(),
    gpuTemp: z.number().optional(),
    ramUsage: z.number().optional(),
    diskUsage: z.number().optional(),
  }),
  z.object({
    type: z.literal('ack'),
    computerId: z.string().min(1),
    commandId: z.string().min(1),
    status: z.enum(['success', 'failed']),
    error: z.string().optional(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
