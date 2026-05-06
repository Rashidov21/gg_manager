import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_OWNER_CHAT_ID: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev_access_secret_please_change_in_prod'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev_refresh_secret_please_change_in_prod'),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  JWT_REFRESH_TTL: z.string().min(1).default('7d'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}

