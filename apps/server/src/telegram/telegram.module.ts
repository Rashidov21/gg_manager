import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertDedupeService } from './alert-dedupe.service';
import { TelegramExceptionFilter } from './telegram-exception.filter';
import { TelegramService } from './telegram.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [TelegramService, AlertDedupeService, TelegramExceptionFilter],
  exports: [TelegramService, TelegramExceptionFilter],
})
export class TelegramModule {}
