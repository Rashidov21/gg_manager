import { Injectable, Logger } from '@nestjs/common';
import type WebSocket from 'ws';

export type ClientCommand =
  | { type: 'lock'; commandId: string }
  | { type: 'reboot'; commandId: string };

@Injectable()
export class ClientConnectionService {
  private readonly logger = new Logger(ClientConnectionService.name);
  private readonly socketsByComputerId = new Map<string, WebSocket>();

  register(computerId: string, socket: WebSocket): void {
    this.socketsByComputerId.set(computerId, socket);
    this.logger.log(`Client registered: ${computerId}`);
  }

  unregisterBySocket(socket: WebSocket): string | null {
    for (const [computerId, ws] of this.socketsByComputerId.entries()) {
      if (ws === socket) {
        this.socketsByComputerId.delete(computerId);
        this.logger.log(`Client disconnected: ${computerId}`);
        return computerId;
      }
    }
    return null;
  }

  sendCommand(computerId: string, command: ClientCommand): boolean {
    const socket = this.socketsByComputerId.get(computerId);
    if (!socket || socket.readyState !== 1) {
      return false;
    }
    socket.send(JSON.stringify(command));
    this.logger.debug(`Command sent to ${computerId}: ${command.type} (${command.commandId})`);
    return true;
  }
}
