import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ServerHealthService } from './server-health.service';

@Module({
  imports: [TelegramModule],
  providers: [ServerHealthService],
})
export class HealthModule {}
