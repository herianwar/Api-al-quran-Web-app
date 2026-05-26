import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export interface SeedProgressEvent {
  job: string;
  current: number;
  total: number;
  percent: number;
  currentItem: string;
  status: string;
  startedAt?: string;
  estimatedDone?: string;
}

export interface SeedDoneEvent {
  job: string;
  totalItems: number;
  duration: string;
  status: 'done';
}

export interface SeedErrorEvent {
  job: string;
  failedItem: string;
  error: string;
  retrying: boolean;
}

@WebSocketGateway({
  namespace: '/seed-progress',
  cors: { origin: '*' },
})
export class SeedGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SeedGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`Seed monitor connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Seed monitor disconnected: ${client.id}`);
  }

  emitProgress(data: SeedProgressEvent): void {
    this.server?.emit('seed:progress', data);
  }

  emitDone(data: SeedDoneEvent): void {
    this.server?.emit('seed:done', data);
  }

  emitError(data: SeedErrorEvent): void {
    this.server?.emit('seed:error', data);
  }

  emitLog(level: 'info' | 'success' | 'warn' | 'error', message: string): void {
    this.server?.emit('seed:log', {
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
