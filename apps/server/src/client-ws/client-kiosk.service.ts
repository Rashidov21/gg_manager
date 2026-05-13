import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionStatus } from '@prisma/client';
import type { Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import type { KioskActiveSessionBody } from './client-kiosk.dto';

export type KioskActiveSessionResult = {
  phone: string;
  balance: number;
  endsAt: string;
};

@Injectable()
export class ClientKioskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async getActiveSession(body: KioskActiveSessionBody): Promise<KioskActiveSessionResult> {
    const pin = this.config.get('GG_CLIENT_PIN', { infer: true });
    if (body.password !== pin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const account = await this.prisma.account.findUnique({
      where: { username: body.phone.trim() },
      select: { id: true, username: true, balance: true },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        computerId: body.computerId,
        accountId: account.id,
        status: SessionStatus.ACTIVE,
        endsAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
      select: { endsAt: true },
    });

    if (!session) {
      throw new NotFoundException('No active session for this PC');
    }

    return {
      phone: account.username,
      balance: Number(account.balance),
      endsAt: session.endsAt.toISOString(),
    };
  }
}
