import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket): Promise<void> {
    this.logger.debug(`Seed monitor connected: ${client.id}`);
    // Push current state of every running job to the freshly connected client
    // so a page refresh (or new tab) doesn't show 0% until the next tick fires.
    try {
      const running = await this.prisma.seedLog.findMany({
        where: { status: 'running' },
      });
      for (const row of running) {
        const percent =
          row.totalItems > 0
            ? Math.round((row.doneItems / row.totalItems) * 10000) / 100
            : 0;
        client.emit('seed:progress', {
          job: row.jobName,
          current: row.doneItems,
          total: row.totalItems,
          percent,
          currentItem: '',
          status: 'running',
          startedAt: row.startedAt?.toISOString(),
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to push snapshot to ${client.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
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
