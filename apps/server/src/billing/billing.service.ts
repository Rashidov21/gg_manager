import { Injectable } from '@nestjs/common';
import { Prisma, TariffType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { quoteBestTariff } from './pricing.engine';
import type { PricingQuote } from './pricing.types';

const BONUS_TOP_UP_THRESHOLD = new Prisma.Decimal(100000);
const BONUS_MINUTES_ON_THRESHOLD = 30;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async quoteForMinutes(params: {
    zone?: string;
    startedAt: Date;
    requestedMinutes: number;
  }): Promise<PricingQuote> {
    const tariffs = await this.prisma.tariff.findMany({
      where: {
        ...(params.zone
          ? { OR: [{ zone: params.zone }, { zone: null }] }
          : { zone: null }),
        type: { in: [TariffType.HOURLY, TariffType.PACKAGE, TariffType.NIGHT] },
      },
    });

    const quote = quoteBestTariff(tariffs, {
      ...(params.zone ? { zone: params.zone } : {}),
      startedAt: params.startedAt,
      requestedMinutes: params.requestedMinutes,
    });

    if (!quote) {
      throw new Error('No applicable tariff found for request');
    }

    return quote;
  }

  async topUpBalance(params: {
    operatorId?: string;
    accountId: string;
    amount: Prisma.Decimal;
  }): Promise<{
    newBalance: Prisma.Decimal;
    bonusMinutesAdded: number;
  }> {
    if (params.amount.lessThanOrEqualTo(new Prisma.Decimal(0))) {
      throw new Error('Top up amount must be positive');
    }

    const bonusMinutesAdded = params.amount.greaterThanOrEqualTo(BONUS_TOP_UP_THRESHOLD)
      ? BONUS_MINUTES_ON_THRESHOLD
      : 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.update({
        where: { id: params.accountId },
        data: {
          balance: { increment: params.amount },
          bonusMinutes: { increment: bonusMinutesAdded },
        },
        select: { balance: true },
      });

      await tx.operatorLog.create({
        data: {
          type: 'TOP_UP',
          operatorId: params.operatorId ?? null,
          accountId: params.accountId,
          amount: params.amount,
          payload: {
            bonusMinutesAdded,
            threshold: BONUS_TOP_UP_THRESHOLD.toString(),
          },
        },
      });

      return account;
    });

    return { newBalance: result.balance, bonusMinutesAdded };
  }
}

