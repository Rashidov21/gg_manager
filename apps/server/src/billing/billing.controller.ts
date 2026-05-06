import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma, TariffType } from '@prisma/client';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/jwt.guard';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { PromoService } from './promo.service';

const tariffTypeEnum = z.enum(['HOURLY', 'PACKAGE', 'NIGHT', 'BONUS']);

const tariffCreateSchema = z.object({
  name: z.string().min(1),
  type: tariffTypeEnum,
  price: z.union([z.number(), z.string()]).transform((v) => new Prisma.Decimal(v)),
  minutes: z.number().int().positive(),
  startHour: z.number().int().min(0).max(23).optional(),
  endHour: z.number().int().min(0).max(23).optional(),
  zone: z.string().optional(),
});

const tariffUpdateSchema = tariffCreateSchema.partial();

const topUpSchema = z.object({
  accountId: z.string().min(1),
  amount: z.union([z.number(), z.string()]).transform((v) => new Prisma.Decimal(v)),
  promoCode: z.string().min(1).optional(),
});

const promoApplySchema = z.object({
  code: z.string().min(1),
  accountId: z.string().min(1),
  topUpAmount: z
    .union([z.number(), z.string()])
    .transform((v) => new Prisma.Decimal(v))
    .optional(),
});

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly promo: PromoService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('tariffs')
  @Roles('OWNER', 'ADMIN', 'OPERATOR')
  async listTariffs() {
    const tariffs = await this.prisma.tariff.findMany({ orderBy: { name: 'asc' } });
    return tariffs.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      price: t.price.toString(),
      minutes: t.minutes,
      startHour: t.startHour,
      endHour: t.endHour,
      zone: t.zone,
    }));
  }

  @Post('tariffs')
  @Roles('OWNER', 'ADMIN')
  async createTariff(@Body() body: unknown) {
    const dto = tariffCreateSchema.parse(body);
    const created = await this.prisma.tariff.create({
      data: {
        name: dto.name,
        type: dto.type as TariffType,
        price: dto.price,
        minutes: dto.minutes,
        ...(dto.startHour !== undefined ? { startHour: dto.startHour } : {}),
        ...(dto.endHour !== undefined ? { endHour: dto.endHour } : {}),
        ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
      },
    });
    return { id: created.id };
  }

  @Put('tariffs/:id')
  @Roles('OWNER', 'ADMIN')
  async updateTariff(@Param('id') id: string, @Body() body: unknown) {
    const dto = tariffUpdateSchema.parse(body);
    await this.prisma.tariff.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type as TariffType } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.minutes !== undefined ? { minutes: dto.minutes } : {}),
        ...(dto.startHour !== undefined ? { startHour: dto.startHour } : {}),
        ...(dto.endHour !== undefined ? { endHour: dto.endHour } : {}),
        ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
      },
    });
    return { ok: true };
  }

  @Delete('tariffs/:id')
  @Roles('OWNER', 'ADMIN')
  async deleteTariff(@Param('id') id: string) {
    await this.prisma.tariff.delete({ where: { id } });
    return { ok: true };
  }

  @Post('topup')
  @Roles('OWNER', 'ADMIN', 'OPERATOR')
  async topUp(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const dto = topUpSchema.parse(body);
    const result = await this.billing.topUpBalance({
      accountId: dto.accountId,
      amount: dto.amount,
      ...(req.user?.id ? { operatorId: req.user.id } : {}),
    });

    let promoResult = null;
    if (dto.promoCode) {
      promoResult = await this.promo.apply({
        code: dto.promoCode,
        accountId: dto.accountId,
        topUpAmount: dto.amount,
        ...(req.user?.id ? { operatorId: req.user.id } : {}),
      });
    }

    return {
      newBalance: result.newBalance.toString(),
      bonusMinutesAdded: result.bonusMinutesAdded,
      promo: promoResult,
    };
  }

  @Post('promo/apply')
  @Roles('OWNER', 'ADMIN', 'OPERATOR')
  async applyPromo(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const dto = promoApplySchema.parse(body);
    return this.promo.apply({
      code: dto.code,
      accountId: dto.accountId,
      ...(dto.topUpAmount !== undefined ? { topUpAmount: dto.topUpAmount } : {}),
      ...(req.user?.id ? { operatorId: req.user.id } : {}),
    });
  }
}
