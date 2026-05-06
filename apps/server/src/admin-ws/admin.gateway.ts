import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type WebSocket from 'ws';
import type { RawData } from 'ws';
import { MachineStatus, Role } from '@prisma/client';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { SessionsService } from '../sessions/sessions.service';
import { CommandTrackerService } from '../client-ws/command-tracker.service';
import { adminCommandSchema, type CommandResult } from './admin.types';

type OutgoingMessage =
  | { type: 'snapshot'; machines: MachineView[] }
  | { type: 'machine-update'; machine: MachineView }
  | { type: 'hardware-alert'; machineId: string; reason: string }
  | { type: 'command-result'; result: CommandResult }
  | { type: 'error'; message: string; commandId?: string };

type MachineView = {
  id: string;
  name: string;
  status: 'IDLE' | 'BUSY' | 'OFFLINE';
  remainingMinutes: number;
  activeSessionId?: string | undefined;
  hardware: {
    cpuTemp?: number | undefined;
    gpuTemp?: number | undefined;
  };
};

function mapStatus(status: MachineStatus): MachineView['status'] {
  if (status === MachineStatus.OFFLINE) return 'OFFLINE';
  if (status === MachineStatus.ACTIVE) return 'BUSY';
  return 'IDLE';
}

@WebSocketGateway({
  path: '/admin',
})
export class AdminGateway {
  private readonly logger = new Logger(AdminGateway.name);
  private readonly users = new WeakMap<WebSocket, AuthenticatedUser>();

  @WebSocketServer()
  private server!: WebSocket.Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
    private readonly sessions: SessionsService,
    private readonly tracker: CommandTrackerService,
    private readonly auth: AuthService,
  ) {
    this.realtime.onMachineUpdate(({ computerId }) => {
      void this.pushMachineUpdate(computerId);
    });
    this.realtime.onHardwareAlert(({ computerId, reason }) => {
      this.broadcast({ type: 'hardware-alert', machineId: computerId, reason });
    });
    this.realtime.onCommandResult((result) => {
      this.broadcast({ type: 'command-result', result });
    });
  }

  afterInit(): void {
    this.server.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      void this.handleConnection(socket, request);
    });
  }

  private async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const token = this.extractToken(request);
    if (!token) {
      this.logger.warn('Admin WS rejected: missing token');
      socket.close(4401, 'Unauthorized');
      return;
    }

    let user: AuthenticatedUser;
    try {
      user = await this.auth.verifyAccessToken(token);
    } catch {
      this.logger.warn('Admin WS rejected: invalid token');
      socket.close(4401, 'Unauthorized');
      return;
    }

    this.users.set(socket, user);
    this.logger.log(`Admin WS connected: ${user.username} (${user.role})`);

    void this.sendSnapshot(socket);

    socket.on('message', (raw: RawData) => {
      const text = raw.toString();
      this.logger.debug(`WS message: ${text}`);
      void this.handleMessage(socket, text);
    });
  }

  private extractToken(request: IncomingMessage): string | null {
    const url = request.url ?? '';
    const idx = url.indexOf('?');
    if (idx >= 0) {
      const query = new URLSearchParams(url.slice(idx + 1));
      const token = query.get('token');
      if (token) return token;
    }
    const auth = request.headers['authorization'];
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7);
    }
    return null;
  }

  private requireRole(socket: WebSocket, allowed: Role[]): AuthenticatedUser | null {
    const user = this.users.get(socket);
    if (!user) {
      this.send(socket, { type: 'error', message: 'Unauthenticated' });
      return null;
    }
    if (!allowed.includes(user.role)) {
      this.send(socket, { type: 'error', message: 'Forbidden role' });
      return null;
    }
    return user;
  }

  private send(socket: WebSocket, msg: OutgoingMessage): void {
    socket.send(JSON.stringify(msg));
  }

  private broadcast(msg: OutgoingMessage): void {
    const text = JSON.stringify(msg);
    for (const client of this.server.clients) {
      if (client.readyState === 1) client.send(text);
    }
  }

  private async sendSnapshot(socket: WebSocket): Promise<void> {
    const machines = await this.getMachineViews();
    this.send(socket, { type: 'snapshot', machines });
  }

  private async pushMachineUpdate(computerId: string): Promise<void> {
    const machine = await this.getMachineView(computerId);
    if (!machine) return;
    this.broadcast({ type: 'machine-update', machine });
  }

  private async getMachineViews(): Promise<MachineView[]> {
    const computers = await this.prisma.computer.findMany({
      include: {
        sessions: {
          where: { status: 'ACTIVE' },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
        snapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
      take: 100,
    });

    const now = Date.now();
    return computers.map((c) => {
      const active = c.sessions[0] ?? null;
      const remainingMinutes =
        active ? Math.max(0, Math.ceil((active.endsAt.getTime() - now) / 60_000)) : 0;
      const snap = c.snapshots[0] ?? null;

      return {
        id: c.id,
        name: c.name,
        status: mapStatus(c.status),
        remainingMinutes,
        ...(active ? { activeSessionId: active.id } : {}),
        hardware: {
          ...(typeof snap?.cpuTemp === 'number' ? { cpuTemp: snap.cpuTemp } : {}),
          ...(typeof snap?.gpuTemp === 'number' ? { gpuTemp: snap.gpuTemp } : {}),
        },
      };
    });
  }

  private async getMachineView(computerId: string): Promise<MachineView | null> {
    const c = await this.prisma.computer.findUnique({
      where: { id: computerId },
      include: {
        sessions: {
          where: { status: 'ACTIVE' },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
        snapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!c) return null;

    const now = Date.now();
    const active = c.sessions[0] ?? null;
    const remainingMinutes =
      active ? Math.max(0, Math.ceil((active.endsAt.getTime() - now) / 60_000)) : 0;
    const snap = c.snapshots[0] ?? null;

    return {
      id: c.id,
      name: c.name,
      status: mapStatus(c.status),
      remainingMinutes,
      ...(active ? { activeSessionId: active.id } : {}),
      hardware: {
        ...(typeof snap?.cpuTemp === 'number' ? { cpuTemp: snap.cpuTemp } : {}),
        ...(typeof snap?.gpuTemp === 'number' ? { gpuTemp: snap.gpuTemp } : {}),
      },
    };
  }

  private async handleMessage(socket: WebSocket, text: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      this.send(socket, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    const parsed = adminCommandSchema.safeParse(json);
    if (!parsed.success) {
      this.send(socket, { type: 'error', message: 'Invalid command' });
      return;
    }

    const cmd = parsed.data;
    const user = this.requireRole(socket, ['OWNER', 'ADMIN', 'OPERATOR']);
    if (!user) return;

    try {
      if (cmd.type === 'startSession') {
        await this.sessions.startSession({
          computerId: cmd.computerId,
          accountId: cmd.accountId,
          requestedMinutes: cmd.requestedMinutes,
          zone: cmd.zone,
          operatorId: user.id,
        });
        this.broadcast({
          type: 'command-result',
          result: { commandId: cmd.commandId, computerId: cmd.computerId, status: 'acked' },
        });
        return;
      }

      if (cmd.type === 'extendTime') {
        await this.sessions.extendSession({
          sessionId: cmd.sessionId,
          additionalMinutes: cmd.additionalMinutes,
          operatorId: user.id,
        });
        this.broadcast({
          type: 'command-result',
          result: { commandId: cmd.commandId, computerId: cmd.sessionId, status: 'acked' },
        });
        return;
      }

      if (cmd.type === 'lock') {
        await this.prisma.operatorLog.create({
          data: {
            type: 'LOCK',
            operatorId: user.id,
            payload: { computerId: cmd.computerId, commandId: cmd.commandId },
          },
        });
        this.tracker.dispatch(cmd.computerId, { type: 'lock', commandId: cmd.commandId });
        this.realtime.emitMachineUpdate(cmd.computerId);
        return;
      }

      if (cmd.type === 'reboot') {
        await this.prisma.operatorLog.create({
          data: {
            type: 'REBOOT',
            operatorId: user.id,
            payload: { computerId: cmd.computerId, commandId: cmd.commandId },
          },
        });
        this.tracker.dispatch(cmd.computerId, { type: 'reboot', commandId: cmd.commandId });
        this.realtime.emitMachineUpdate(cmd.computerId);
        return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Command failed';
      this.send(socket, { type: 'error', message: msg, commandId: cmd.commandId });
      this.broadcast({
        type: 'command-result',
        result: {
          commandId: cmd.commandId,
          computerId:
            'computerId' in cmd
              ? cmd.computerId
              : 'sessionId' in cmd
                ? cmd.sessionId
                : '',
          status: 'failed',
          error: msg,
        },
      });
    }
  }
}
