import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { promises as fsp } from 'fs';
import { PrismaService } from '../../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Optional click action / deep-link path, e.g. "/surat/1" */
  data?: Record<string, string>;
}

export interface SendResult {
  attempted: number;
  successful: number;
  failed: number;
  invalidTokensRemoved: number;
}

/**
 * Firebase Cloud Messaging wrapper.
 *
 * • If `FCM_SERVICE_ACCOUNT_PATH` is not set or unreadable at boot, the
 *   service runs in NO-OP mode: every `send*` call logs a warning and
 *   returns a "0 attempted" result. This lets the rest of the app boot in
 *   environments without push credentials (dev, CI, snapshot restores).
 *
 * • Invalid / unregistered tokens reported by FCM are automatically purged
 *   from device_tokens so they don't keep failing in future broadcasts.
 */
@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private app: admin.app.App | null = null;
  private get messaging(): admin.messaging.Messaging | null {
    return this.app ? this.app.messaging() : null;
  }

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const path = this.config.get<string>('fcmServiceAccountPath');
    if (!path) {
      this.logger.warn(
        'FCM_SERVICE_ACCOUNT_PATH not set — push notifications disabled (no-op mode).',
      );
      return;
    }
    try {
      const raw = await fsp.readFile(path, 'utf-8');
      const cred = JSON.parse(raw);
      this.app = admin.initializeApp({
        credential: admin.credential.cert(cred as admin.ServiceAccount),
      }, 'quran-api-fcm');
      this.logger.log(
        `FCM initialized (project: ${cred.project_id ?? 'unknown'})`,
      );
    } catch (err) {
      this.logger.error(
        `FCM init failed (${path}): ${(err as Error).message}. Push notifications disabled.`,
      );
    }
  }

  isEnabled(): boolean {
    return this.app !== null;
  }

  /**
   * Pre-send snapshot for the admin broadcast UI: whether push is actually
   * wired up (FCM initialized) and how many devices a broadcast would target.
   */
  async broadcastTargets(): Promise<{
    pushEnabled: boolean;
    deviceCount: number;
  }> {
    const deviceCount = await this.prisma.deviceToken.count();
    return { pushEnabled: this.isEnabled(), deviceCount };
  }

  /** Send a push to every device a specific user owns. */
  async sendToUser(userId: string, payload: PushPayload): Promise<SendResult> {
    const devices = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return this.sendToTokens(
      devices.map((d) => d.token),
      payload,
    );
  }

  /**
   * Broadcast to every registered device (admin use only). Writes a row to
   * the `broadcasts` table so the admin panel can show a history with
   * delivery counts.
   */
  async sendBroadcast(
    payload: PushPayload,
    actorId?: string,
  ): Promise<SendResult & { broadcastId: string }> {
    const devices = await this.prisma.deviceToken.findMany({
      select: { token: true },
    });
    const row = await this.prisma.broadcast.create({
      data: {
        title: payload.title,
        body: payload.body,
        deeplink: payload.data?.deeplink ?? null,
        status: 'sent',
        sentAt: new Date(),
        sentByUserId: actorId ?? null,
      },
      select: { id: true },
    });
    const result = await this.sendToTokens(
      devices.map((d) => d.token),
      payload,
    );
    await this.prisma.broadcast.update({
      where: { id: row.id },
      data: {
        attemptedCount: result.attempted,
        successCount: result.successful,
        failedCount: result.failed,
        invalidRemoved: result.invalidTokensRemoved,
      },
    });
    return { ...result, broadcastId: row.id };
  }

  async listBroadcasts(): Promise<unknown[]> {
    return this.prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        deeplink: true,
        status: true,
        attemptedCount: true,
        successCount: true,
        failedCount: true,
        invalidRemoved: true,
        scheduledAt: true,
        sentAt: true,
        errorMsg: true,
        createdAt: true,
      },
    });
  }

  /** Send to all users who have at least one device registered. */
  async sendToAllUsersWithDevices(
    payload: PushPayload,
  ): Promise<SendResult> {
    return this.sendBroadcast(payload);
  }

  // ─── Internal ───────────────────────────────────────────────────────

  private async sendToTokens(
    tokens: string[],
    payload: PushPayload,
  ): Promise<SendResult> {
    if (tokens.length === 0) {
      return { attempted: 0, successful: 0, failed: 0, invalidTokensRemoved: 0 };
    }
    if (!this.messaging) {
      this.logger.warn(
        `FCM disabled — would have sent "${payload.title}" to ${tokens.length} devices.`,
      );
      return { attempted: tokens.length, successful: 0, failed: tokens.length, invalidTokensRemoved: 0 };
    }

    // FCM caps batch sendEachForMulticast at 500 tokens.
    let attempted = 0;
    let successful = 0;
    let failed = 0;
    const toDelete: string[] = [];

    const BATCH = 500;
    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH);
      attempted += batch.length;
      try {
        const result = await this.messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
        });
        successful += result.successCount;
        failed += result.failureCount;
        result.responses.forEach((r, idx) => {
          if (r.success) return;
          const code = r.error?.code ?? '';
          // These error codes mean the token is permanently invalid —
          // remove from DB to avoid wasting FCM quota next time.
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            toDelete.push(batch[idx]);
          }
        });
      } catch (err) {
        failed += batch.length;
        this.logger.warn(
          `FCM batch send failed: ${(err as Error).message}`,
        );
      }
    }

    let invalidTokensRemoved = 0;
    if (toDelete.length > 0) {
      const result = await this.prisma.deviceToken.deleteMany({
        where: { token: { in: toDelete } },
      });
      invalidTokensRemoved = result.count;
      this.logger.log(
        `Purged ${invalidTokensRemoved} invalid FCM tokens.`,
      );
    }

    return { attempted, successful, failed, invalidTokensRemoved };
  }
}
