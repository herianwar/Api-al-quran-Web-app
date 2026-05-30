import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponsePayload, ok } from '../../common/dto/api-response';

const KEY_BYTES = 32; // 256-bit raw key → ~43-char base64url
const BCRYPT_ROUNDS = 10;

export interface CreateApiKeyInput {
  name: string;
  scopes?: string;
  rateLimit?: number;
  expiresAt?: string;
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a fresh API key. The raw secret is returned ONCE in the
   * response; we only store the bcrypt hash so it cannot be recovered later.
   */
  async create(
    input: CreateApiKeyInput,
  ): Promise<ResponsePayload<unknown>> {
    const raw = `qsk_${randomBytes(KEY_BYTES).toString('base64url')}`;
    const keyHash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
    const keyPrefix = raw.slice(0, 12);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        message: 'expiresAt harus di masa depan',
        error: 'BAD_REQUEST',
      });
    }
    const row = await this.prisma.apiKey.create({
      data: {
        name: input.name,
        keyHash,
        keyPrefix,
        scopes: input.scopes ?? 'read',
        rateLimit: input.rateLimit ?? 0,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimit: true,
        enabled: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return ok(
      { ...row, key: raw },
      'API key dibuat — SIMPAN sekarang, tidak akan ditampilkan lagi.',
    );
  }

  async list(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimit: true,
        enabled: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return ok(rows, 'Daftar API key', { total: rows.length });
  }

  async setEnabled(
    id: string,
    enabled: boolean,
  ): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.apiKey
      .update({ where: { id }, data: { enabled } })
      .catch(() => null);
    if (!row) {
      throw new NotFoundException({
        message: 'API key tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok(
      { id: row.id, enabled: row.enabled },
      enabled ? 'API key diaktifkan' : 'API key dinonaktifkan',
    );
  }

  async remove(id: string): Promise<ResponsePayload<unknown>> {
    const result = await this.prisma.apiKey
      .delete({ where: { id } })
      .catch(() => null);
    if (!result) {
      throw new NotFoundException({
        message: 'API key tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok({ deleted: true }, 'API key dihapus');
  }

  /**
   * Validate an incoming X-API-Key header. Returns the matched key row, or
   * throws Unauthorized. Updates lastUsedAt asynchronously (best-effort).
   *
   * NOTE: bcrypt compare cost is high; we therefore filter candidates by
   * the 12-char prefix first to make this O(1) in practice (prefix is
   * indexed via the keyHash unique index — bcrypt fingerprint is unique).
   */
  async verify(raw: string): Promise<{
    id: string;
    name: string;
    scopes: string;
    rateLimit: number;
  } | null> {
    if (!raw || raw.length < 16) return null;
    const prefix = raw.slice(0, 12);
    const candidates = await this.prisma.apiKey.findMany({
      where: { keyPrefix: prefix, enabled: true },
    });
    for (const c of candidates) {
      if (c.expiresAt && c.expiresAt < new Date()) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(raw, c.keyHash)) {
        // Fire-and-forget — touching lastUsedAt on every request is fine
        // because we don't await it on the hot path.
        void this.prisma.apiKey
          .update({ where: { id: c.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
        return {
          id: c.id,
          name: c.name,
          scopes: c.scopes,
          rateLimit: c.rateLimit,
        };
      }
    }
    return null;
  }

  /**
   * Throws Unauthorized if the raw key is invalid. Used by guards.
   */
  async verifyOrThrow(raw: string) {
    const result = await this.verify(raw);
    if (!result) {
      throw new UnauthorizedException({
        message: 'X-API-Key tidak valid',
        error: 'UNAUTHORIZED',
      });
    }
    return result;
  }
}
