import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  paginationArgs,
  paginationMeta,
  sinceWhere,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

export interface AuditEntry {
  action: string;
  actorId?: string;
  actorEmail?: string;
  target?: string;
  metadata?: Record<string, unknown>;
  clientHint?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an audit log entry. Always non-throwing — audit log failures
   * should never break the actual business operation that triggered it.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail ?? null,
          target: entry.target ?? null,
          metadata: (entry.metadata ?? null) as Prisma.InputJsonValue,
          clientHint: entry.clientHint ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `audit log write failed for ${entry.action}: ${(err as Error).message}`,
      );
    }
  }

  async list(query: AuditQueryDto): Promise<ResponsePayload<unknown>> {
    const { skip, take } = paginationArgs(query);
    const q = query.q?.trim();
    // `sinceWhere` already exists on PaginationQueryDto; the previous
    // implementation accepted `?since=` via the DTO but silently ignored it
    // because the where clause never used it.
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(q
        ? {
            OR: [
              { actorEmail: { contains: q, mode: 'insensitive' as const } },
              { target: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(sinceWhere(query, 'createdAt') as Prisma.AuditLogWhereInput),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return ok(rows, 'Audit log', paginationMeta(query, total));
  }
}
