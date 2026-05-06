import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('search')
  @Roles('OWNER', 'ADMIN', 'OPERATOR')
  async search(@Query('q') q?: string) {
    const query = (q ?? '').trim();
    const accounts = await this.prisma.account.findMany({
      ...(query
        ? { where: { username: { contains: query, mode: 'insensitive' as const } } }
        : {}),
      orderBy: { username: 'asc' },
      take: 20,
      select: {
        id: true,
        username: true,
        balance: true,
        bonusMinutes: true,
        tier: true,
      },
    });
    return accounts.map((a) => ({
      id: a.id,
      username: a.username,
      balance: a.balance.toString(),
      bonusMinutes: a.bonusMinutes,
      tier: a.tier ?? null,
    }));
  }
}
