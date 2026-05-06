import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { Telegraf, type Context } from 'telegraf';
import { MachineStatus } from '@prisma/client';
import { AlertDedupeService } from './alert-dedupe.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private ownerChatId: string | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly dedupe: AlertDedupeService,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    const ownerChatId = this.config.get('TELEGRAM_OWNER_CHAT_ID', { infer: true });
    this.ownerChatId = ownerChatId;

    const bot = new Telegraf<Context>(token);

    bot.command('status', async (ctx: Context) => {
      try {
        const busyCount = await this.prisma.computer.count({
          where: { status: MachineStatus.ACTIVE },
        });
        const total = await this.prisma.computer.count();

        await ctx.reply(
          `GG Manager status:\n` +
            `Band PC: ${busyCount} ta\n` +
            `Jami PC: ${total} ta`,
        );
      } catch (error) {
        this.logger.error('Failed to handle /status', error as Error);
        await ctx.reply('Statusni olishda xatolik yuz berdi.');
      }
    });

    try {
      await bot.launch();
      this.logger.log('Telegram bot launched');
      this.bot = bot;
    } catch (error) {
      this.logger.error('Telegram bot launch failed; continuing without bot', error as Error);
      this.bot = null;
    }
  }

  @Cron('0 0 * * *', {
    timeZone: 'Asia/Tashkent',
  })
  async sendDailyReport(): Promise<void> {
    if (!this.bot || !this.ownerChatId) return;

    try {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const until = new Date(since);
      until.setDate(since.getDate() + 1);

      // Kunlik tushum (faqat TOP_UP transactionlar yig'indisi)
      const dailyTopups = await this.prisma.operatorLog.aggregate({
        _sum: { amount: true },
        where: {
          type: 'TOP_UP',
          createdAt: { gte: since, lt: until },
        },
      });

      const revenue = dailyTopups._sum.amount ?? 0;

      // Eng ko'p band bo'lgan PC (session soni bo'yicha)
      const busiest = await this.prisma.session.groupBy({
        by: ['computerId'],
        _count: { id: true },
        where: { startedAt: { gte: since, lt: until } },
        orderBy: { _count: { id: 'desc' } },
        take: 1,
      });

      let busiestLine = 'Maʼlumot yoʻq';
      if (busiest.length > 0) {
        const computer = await this.prisma.computer.findUnique({
          where: { id: busiest[0]!.computerId },
        });
        busiestLine = `${computer?.name ?? busiest[0]!.computerId} (${busiest[0]!._count.id} session)`;
      }

      // Operator activity: bugungi OperatorLog soni
      const operatorActivity = await this.prisma.operatorLog.count({
        where: { createdAt: { gte: since, lt: until } },
      });

      const text =
        `📊 Kunlik hisobot\n` +
        `Sana: ${since.toISOString().slice(0, 10)}\n\n` +
        `💰 Kunlik tushum: ${revenue.toString()} soʻm\n` +
        `🖥 Eng koʻp band bo'lgan PC: ${busiestLine}\n` +
        `👤 Operator activity (loglar): ${operatorActivity} ta`;

      await this.bot.telegram.sendMessage(this.ownerChatId, text);
    } catch (error) {
      this.logger.error('Failed to send daily report', error as Error);
    }
  }

  async sendHardwareAlert(computerId: string, message: string): Promise<void> {
    if (!this.bot || !this.ownerChatId) return;
    if (!this.dedupe.shouldSend(`hw:${computerId}:${message}`)) {
      this.logger.debug(`Hardware alert deduped for ${computerId}`);
      return;
    }
    try {
      await this.bot.telegram.sendMessage(
        this.ownerChatId,
        `⚠️ Hardware alert\nPC: ${computerId}\n${message}`,
      );
    } catch (error) {
      this.logger.error('Failed to send hardware alert', error as Error);
    }
  }

  async sendServerAlert(message: string): Promise<void> {
    if (!this.bot || !this.ownerChatId) return;
    if (!this.dedupe.shouldSend(`server:${message}`)) {
      this.logger.debug('Server alert deduped');
      return;
    }
    try {
      await this.bot.telegram.sendMessage(
        this.ownerChatId,
        `🚨 Server alert\n${message}`,
      );
    } catch (error) {
      this.logger.error('Failed to send server alert', error as Error);
    }
  }
}

