import { Injectable } from '@nestjs/common';
import { MachineStatus, Prisma, SessionStatus } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ExtendSessionDto, StartSessionDto } from './sessions.dto';
import { RealtimeBus } from '../realtime/realtime.bus';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly realtime: RealtimeBus,
  ) {}

  async startSession(params: StartSessionDto & { operatorId?: string }): Promise<void> {
    const now = new Date();

    const quote = await this.billing.quoteForMinutes(
      params.zone
        ? {
            zone: params.zone,
            startedAt: now,
            requestedMinutes: params.requestedMinutes,
          }
        : {
            startedAt: now,
            requestedMinutes: params.requestedMinutes,
          },
    );

    const durationMinutes = quote.minutes;
    const endsAt = new Date(now.getTime() + durationMinutes * 60_000);

    await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUniqueOrThrow({
        where: { id: params.accountId },
        select: { balance: true },
      });

      const newBalance = (account.balance as Prisma.Decimal).sub(quote.price);
      if (newBalance.lessThan(0)) {
        throw new Error('Insufficient balance for session');
      }

      await tx.account.update({
        where: { id: params.accountId },
        data: { balance: newBalance },
      });

      const session = await tx.session.create({
        data: {
          computerId: params.computerId,
          accountId: params.accountId,
          tariffId: quote.tariffId,
          status: SessionStatus.ACTIVE,
          startedAt: now,
          endsAt,
        },
      });

      await tx.computer.update({
        where: { id: params.computerId },
        data: { status: MachineStatus.ACTIVE, lastSeenAt: now },
      });

      await tx.operatorLog.create({
        data: {
          type: 'SESSION_START',
          operatorId: params.operatorId ?? null,
          accountId: params.accountId,
          sessionId: session.id,
          amount: quote.price,
          payload: {
            requestedMinutes: params.requestedMinutes,
            chargedMinutes: durationMinutes,
            tariffId: quote.tariffId,
            tariffName: quote.tariffName,
            reason: quote.reason,
          },
        },
      });
    });

    this.realtime.emitMachineUpdate(params.computerId);
  }

  async extendSession(params: ExtendSessionDto & { operatorId?: string }): Promise<void> {
    const now = new Date();

    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: params.sessionId },
      include: { account: true, tariff: true },
    });

    if (!session.accountId || !session.account) {
      throw new Error('Cannot extend session without account');
    }

    const quote = await this.billing.quoteForMinutes({
      startedAt: now,
      requestedMinutes: params.additionalMinutes,
    });

    const durationMinutes = quote.minutes;
    const addedMs = durationMinutes * 60_000;

    await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUniqueOrThrow({
        where: { id: session.accountId! },
        select: { balance: true },
      });

      const newBalance = (account.balance as Prisma.Decimal).sub(quote.price);
      if (newBalance.lessThan(0)) {
        throw new Error('Insufficient balance for extension');
      }

      await tx.account.update({
        where: { id: session.accountId! },
        data: { balance: newBalance },
      });

      const updated = await tx.session.update({
        where: { id: session.id },
        data: {
          endsAt: new Date(session.endsAt.getTime() + addedMs),
          localRevision: { increment: 1 },
        },
      });

      await tx.operatorLog.create({
        data: {
          type: 'SESSION_EXTEND',
          operatorId: params.operatorId ?? null,
          accountId: session.accountId,
          sessionId: updated.id,
          amount: quote.price,
          payload: {
            additionalMinutes: params.additionalMinutes,
            chargedMinutes: durationMinutes,
            tariffId: quote.tariffId,
            tariffName: quote.tariffName,
            reason: quote.reason,
          },
        },
      });
    });

    this.realtime.emitMachineUpdate(session.computerId);
  }
}

