import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { CommandResult } from '../admin-ws/admin.types';

export type MachineUpdatePayload = {
  computerId: string;
};

type Events = {
  'machine.update': (payload: MachineUpdatePayload) => void;
  'hardware.alert': (payload: { computerId: string; reason: string }) => void;
  'command.result': (payload: CommandResult) => void;
};

class TypedEmitter extends EventEmitter {
  override on<K extends keyof Events>(eventName: K, listener: Events[K]): this {
    return super.on(eventName as string, listener as (...args: unknown[]) => void);
  }
  override emit<K extends keyof Events>(eventName: K, ...args: Parameters<Events[K]>): boolean {
    return super.emit(eventName as string, ...(args as unknown[]));
  }
}

@Injectable()
export class RealtimeBus {
  private readonly emitter = new TypedEmitter();

  onMachineUpdate(listener: (p: MachineUpdatePayload) => void): void {
    this.emitter.on('machine.update', listener);
  }

  emitMachineUpdate(computerId: string): void {
    this.emitter.emit('machine.update', { computerId });
  }

  onHardwareAlert(listener: (p: { computerId: string; reason: string }) => void): void {
    this.emitter.on('hardware.alert', listener);
  }

  emitHardwareAlert(computerId: string, reason: string): void {
    this.emitter.emit('hardware.alert', { computerId, reason });
  }

  onCommandResult(listener: (p: CommandResult) => void): void {
    this.emitter.on('command.result', listener);
  }

  emitCommandResult(payload: CommandResult): void {
    this.emitter.emit('command.result', payload);
  }
}
