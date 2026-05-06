import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from './env';
import { HealthController } from './health.controller';
import { BillingModule } from './billing/billing.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';
import { SessionsModule } from './sessions/sessions.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminWsModule } from './admin-ws/admin-ws.module';
import { ClientWsModule } from './client-ws/client-ws.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { HealthModule } from './health/health.module';
import { UsbWhitelistModule } from './usb-whitelist/usb-whitelist.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (raw: Record<string, unknown>) => parseEnv(raw),
    }),
    PrismaModule,
    RealtimeModule,
    AuthModule,
    AccountsModule,
    BillingModule,
    TelegramModule,
    HealthModule,
    UsbWhitelistModule,
    SessionsModule,
    ClientWsModule,
    AdminWsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

