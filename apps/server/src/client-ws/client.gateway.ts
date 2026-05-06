import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { MachineStatus } from '@prisma/client';
import type { RawData } from 'ws';
import type WebSocket from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { TelegramService } from '../telegram/telegram.service';
import { ClientConnectionService } from './client-connection.service';
import { CommandTrackerService } from './command-tracker.service';
import { clientMessageSchema } from './client.types';

const DEFAULT_CRITICAL_CPU_TEMP = 90;
const DEFAULT_CRITICAL_GPU_TEMP = 90;
const DEFAULT_CRITICAL_RAM_USAGE = 90;
const DEFAULT_CRITICAL_DISK_USAGE = 90;

type CriticalThresholds = {
  cpuTemp: number;
  gpuTemp: number;
  ramUsage: number;
  diskUsage: number;
};

@WebSocketGateway({
  path: '/client',
})
export class ClientGateway {
  private readonly logger = new Logger(ClientGateway.name);

  @WebSocketServer()
  private server!: WebSocket.Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
    private readonly telegram: TelegramService,
    private readonly connections: ClientConnectionService,
    private readonly tracker: CommandTrackerService,
  ) {}

  afterInit(): void {
    this.server.on('connection', (socket: WebSocket) => {
      this.logger.log('Client WS connected');

      socket.on('message', (raw: RawData) => {
        void this.handleMessage(socket, raw.toString());
      });

      socket.on('close', () => {
        const computerId = this.connections.unregisterBySocket(socket);
        if (!computerId) return;
        void this.markOffline(computerId);
      });
    });
  }

  private async handleMessage(socket: WebSocket, text: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid payload' }));
      return;
    }

    const msg = parsed.data;
    if (msg.type === 'register') {
      this.connections.register(msg.computerId, socket);
      await this.prisma.computer.update({
        where: { id: msg.computerId },
        data: { status: MachineStatus.ONLINE, lastSeenAt: new Date() },
      });
      this.realtime.emitMachineUpdate(msg.computerId);
      return;
    }

    if (msg.type === 'heartbeat') {
      await this.prisma.computer.update({
        where: { id: msg.computerId },
        data: { lastSeenAt: new Date(), status: MachineStatus.ONLINE },
      });
      this.realtime.emitMachineUpdate(msg.computerId);
      return;
    }

    if (msg.type === 'ack') {
      this.tracker.ack(msg.commandId, msg.status, msg.error);
      return;
    }

    if (msg.type === 'snapshot') {
      await this.prisma.hardwareSnapshot.create({
        data: {
          computerId: msg.computerId,
          ...(typeof msg.cpuUsage === 'number' ? { cpuUsage: msg.cpuUsage } : {}),
          ...(typeof msg.cpuTemp === 'number' ? { cpuTemp: msg.cpuTemp } : {}),
          ...(typeof msg.gpuTemp === 'number' ? { gpuTemp: msg.gpuTemp } : {}),
          ...(typeof msg.ramUsage === 'number' ? { ramUsage: msg.ramUsage } : {}),
          ...(typeof msg.diskUsage === 'number' ? { diskUsage: msg.diskUsage } : {}),
        },
      });
      const computer = await this.prisma.computer.update({
        where: { id: msg.computerId },
        data: { lastSeenAt: new Date(), status: MachineStatus.ONLINE },
        select: {
          warnCpuTemp: true,
          warnGpuTemp: true,
          warnRamUsage: true,
          warnDiskUsage: true,
        },
      });
      this.realtime.emitMachineUpdate(msg.computerId);

      const thresholds: CriticalThresholds = {
        cpuTemp: computer.warnCpuTemp ?? DEFAULT_CRITICAL_CPU_TEMP,
        gpuTemp: computer.warnGpuTemp ?? DEFAULT_CRITICAL_GPU_TEMP,
        ramUsage: computer.warnRamUsage ?? DEFAULT_CRITICAL_RAM_USAGE,
        diskUsage: computer.warnDiskUsage ?? DEFAULT_CRITICAL_DISK_USAGE,
      };

      const reason = this.getCriticalReason(thresholds, msg);
      if (reason) {
        await this.prisma.computer.update({
          where: { id: msg.computerId },
          data: { status: MachineStatus.ERROR },
        });
        this.realtime.emitHardwareAlert(msg.computerId, reason);
        await this.telegram.sendHardwareAlert(msg.computerId, reason);
      }
    }
  }

  private getCriticalReason(
    thresholds: CriticalThresholds,
    snap: {
      cpuTemp?: number | undefined;
      gpuTemp?: number | undefined;
      ramUsage?: number | undefined;
      diskUsage?: number | undefined;
    },
  ): string | null {
    if (typeof snap.cpuTemp === 'number' && snap.cpuTemp >= thresholds.cpuTemp) {
      return `CPU temp critical: ${snap.cpuTemp}C (>=${thresholds.cpuTemp})`;
    }
    if (typeof snap.gpuTemp === 'number' && snap.gpuTemp >= thresholds.gpuTemp) {
      return `GPU temp critical: ${snap.gpuTemp}C (>=${thresholds.gpuTemp})`;
    }
    if (typeof snap.ramUsage === 'number' && snap.ramUsage >= thresholds.ramUsage) {
      return `RAM usage critical: ${snap.ramUsage}% (>=${thresholds.ramUsage}%)`;
    }
    if (typeof snap.diskUsage === 'number' && snap.diskUsage >= thresholds.diskUsage) {
      return `Disk usage critical: ${snap.diskUsage}% (>=${thresholds.diskUsage}%)`;
    }
    return null;
  }

  private async markOffline(computerId: string): Promise<void> {
    await this.prisma.computer.update({
      where: { id: computerId },
      data: { status: MachineStatus.OFFLINE, lastSeenAt: new Date() },
    });
    this.realtime.emitMachineUpdate(computerId);
  }
}
