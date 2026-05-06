import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PromoApplyResult = {
  promoCode: string;
  bonusPercent: number | null;
  bonusMinutes: number | null;
  appliedAccountId: string;
  newBalance?: string;
  newBonusMinutes?: number;
};

@Injectable()
export class PromoService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(params: {
    code: string;
    accountId: string;
    operatorId?: string;
    topUpAmount?: Prisma.Decimal;
  }): Promise<PromoApplyResult> {
    const code = params.code.trim();
    if (!code) throw new BadRequestException('Promo code is empty');

    return this.prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({ where: { code } });
      if (!promo) throw new NotFoundException('Promo not found');

      if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('Promo expired');
      }
      if (typeof promo.maxUses === 'number' && promo.usedCount >= promo.maxUses) {
        throw new BadRequestException('Promo usage limit reached');
      }

      const account = await tx.account.findUnique({ where: { id: params.accountId } });
      if (!account) throw new NotFoundException('Account not found');

      const bonusMinutesFromPromo = promo.bonusMinutes ?? 0;
      const bonusPercentFromPromo = promo.bonusPercent ?? 0;

      let extraBalance = new Prisma.Decimal(0);
      if (params.topUpAmount && bonusPercentFromPromo > 0) {
        extraBalance = params.topUpAmount.mul(bonusPercentFromPromo).div(100);
      }

      const updatedAccount = await tx.account.update({
        where: { id: params.accountId },
        data: {
          balance: { increment: extraBalance },
          bonusMinutes: { increment: bonusMinutesFromPromo },
        },
        select: { balance: true, bonusMinutes: true },
      });

      await tx.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });

      await tx.operatorLog.create({
        data: {
          type: 'TOP_UP',
          accountId: params.accountId,
          operatorId: params.operatorId ?? null,
          amount: extraBalance,
          payload: {
            promoCode: code,
            bonusPercent: bonusPercentFromPromo,
            bonusMinutes: bonusMinutesFromPromo,
          },
        },
      });

      return {
        promoCode: code,
        bonusPercent: promo.bonusPercent,
        bonusMinutes: promo.bonusMinutes,
        appliedAccountId: params.accountId,
        newBalance: updatedAccount.balance.toString(),
        newBonusMinutes: updatedAccount.bonusMinutes,
      };
    });
  }
}
