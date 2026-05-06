import { Injectable, Logger } from '@nestjs/common';
import { RealtimeBus } from '../realtime/realtime.bus';
import { ClientConnectionService } from './client-connection.service';

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 2000;

type ClientCommand =
  | { type: 'lock'; commandId: string }
  | { type: 'reboot'; commandId: string };

type Pending = {
  commandId: string;
  computerId: string;
  command: ClientCommand;
  attempts: number;
  timer: NodeJS.Timeout;
};

@Injectable()
export class CommandTrackerService {
  private readonly logger = new Logger(CommandTrackerService.name);
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly clients: ClientConnectionService,
    private readonly realtime: RealtimeBus,
  ) {}

  dispatch(computerId: string, command: ClientCommand): void {
    const sent = this.tryDeliver(computerId, command);
    if (!sent) {
      this.fail(command.commandId, computerId, 'Client offline');
      return;
    }

    this.realtime.emitCommandResult({
      commandId: command.commandId,
      computerId,
      status: 'sent',
    });

    this.schedule(computerId, command, 1);
  }

  ack(commandId: string, status: 'success' | 'failed', error?: string): void {
    const entry = this.pending.get(commandId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(commandId);

    this.logger.debug(`ACK ${commandId} status=${status}`);
    this.realtime.emitCommandResult({
      commandId,
      computerId: entry.computerId,
      status: status === 'success' ? 'acked' : 'failed',
      ...(error !== undefined ? { error } : {}),
    });
  }

  private schedule(computerId: string, command: ClientCommand, attempt: number): void {
    const timer = setTimeout(() => {
      this.onTimeout(computerId, command, attempt);
    }, ATTEMPT_TIMEOUT_MS);

    this.pending.set(command.commandId, {
      commandId: command.commandId,
      computerId,
      command,
      attempts: attempt,
      timer,
    });
  }

  private onTimeout(computerId: string, command: ClientCommand, attempt: number): void {
    this.pending.delete(command.commandId);

    if (attempt >= MAX_ATTEMPTS) {
      this.fail(command.commandId, computerId, `No ack after ${MAX_ATTEMPTS} attempts`);
      return;
    }

    const sent = this.tryDeliver(computerId, command);
    if (!sent) {
      this.fail(command.commandId, computerId, 'Client offline during retry');
      return;
    }

    this.logger.debug(`Retry ${command.commandId} attempt=${attempt + 1}`);
    this.schedule(computerId, command, attempt + 1);
  }

  private tryDeliver(computerId: string, command: ClientCommand): boolean {
    return this.clients.sendCommand(computerId, command);
  }

  private fail(commandId: string, computerId: string, reason: string): void {
    this.logger.warn(`Command ${commandId} failed: ${reason}`);
    this.realtime.emitCommandResult({
      commandId,
      computerId,
      status: 'failed',
      error: reason,
    });
  }
}
