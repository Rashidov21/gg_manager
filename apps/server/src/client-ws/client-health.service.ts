import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MachineStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';

const OFFLINE_AFTER_MS = 20_000;

@Injectable()
export class ClientHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
  ) {}

  @Cron('*/10 * * * * *')
  async markStaleClientsOffline(): Promise<void> {
    const threshold = new Date(Date.now() - OFFLINE_AFTER_MS);

    const stale = await this.prisma.computer.findMany({
      where: {
        status: { not: MachineStatus.OFFLINE },
        lastSeenAt: { not: null, lt: threshold },
      },
      select: { id: true },
      take: 1000,
    });

    if (stale.length === 0) return;

    await this.prisma.computer.updateMany({
      where: {
        id: { in: stale.map((s) => s.id) },
      },
      data: { status: MachineStatus.OFFLINE },
    });

    for (const s of stale) {
      this.realtime.emitMachineUpdate(s.id);
    }
  }
}

