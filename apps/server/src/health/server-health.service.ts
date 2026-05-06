import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class ServerHealthService {
  private readonly logger = new Logger(ServerHealthService.name);
  private lastOk = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async check(): Promise<void> {
    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      if (!this.lastOk) {
        this.logger.log('Database health restored');
        await this.telegram.sendServerAlert('Database health restored');
      }
      this.lastOk = true;
    } catch (error) {
      this.lastOk = false;
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`Database health check failed: ${message}`);
      await this.telegram.sendServerAlert(`Database health check failed: ${message}`);
    }
  }
}
