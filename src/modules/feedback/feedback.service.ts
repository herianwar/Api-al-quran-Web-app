import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { paginationArgs, paginationMeta } from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFeedbackDto,
  FEEDBACK_KATEGORI,
  FEEDBACK_STATUS,
  FeedbackListQueryDto,
  UpdateFeedbackDto,
} from './dto/feedback.dto';

/** User fields joined into admin detail/list (never exposed publicly). */
const USER_SELECT = {
  id: true,
  nama: true,
  email: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Publik: submit ──────────────────────────────────────────────────

  /** Simpan masukan baru. `userId` null untuk guest, terisi kalau login. */
  async create(
    dto: CreateFeedbackDto,
    userId: string | null,
  ): Promise<ResponsePayload<{ id: string; status: string }>> {
    const row = await this.prisma.feedback.create({
      data: {
        kategori: dto.kategori,
        judul: dto.judul,
        deskripsi: dto.deskripsi,
        email: dto.email ?? null,
        userId: userId ?? null,
        appVersion: dto.appVersion ?? null,
        platform: dto.platform ?? null,
        // status defaults to "baru" via the schema.
      },
      select: { id: true, status: true },
    });
    return ok(row, 'Masukan berhasil dikirim');
  }

  // ─── Admin: list ─────────────────────────────────────────────────────

  async list(query: FeedbackListQueryDto): Promise<ResponsePayload<unknown>> {
    const where: Prisma.FeedbackWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.kategori) where.kategori = query.kategori;
    if (query.q) {
      where.OR = [
        { judul: { contains: query.q, mode: 'insensitive' } },
        { deskripsi: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      const d = new Date(query.from);
      if (!isNaN(d.getTime())) createdAt.gte = d;
    }
    if (query.to) {
      const d = new Date(query.to);
      if (!isNaN(d.getTime())) createdAt.lte = d;
    }
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

    const order = (query.order === 'asc' ? 'asc' : 'desc') as Prisma.SortOrder;
    const orderBy: Prisma.FeedbackOrderByWithRelationInput[] =
      query.sort === 'status'
        ? [{ status: order }, { createdAt: 'desc' }]
        : [{ createdAt: order }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        orderBy,
        include: { user: { select: USER_SELECT } },
        ...paginationArgs(query),
      }),
    ]);

    return ok(rows, 'Daftar masukan', paginationMeta(query, total));
  }

  // ─── Admin: detail ───────────────────────────────────────────────────

  async getById(id: string): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.feedback.findUnique({
      where: { id },
      include: { user: { select: USER_SELECT } },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Masukan #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Detail masukan');
  }

  // ─── Admin: update (status + catatan) ────────────────────────────────

  async update(
    id: string,
    dto: UpdateFeedbackDto,
  ): Promise<ResponsePayload<unknown>> {
    await this.ensureExists(id);
    const data: Prisma.FeedbackUpdateInput = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.catatanAdmin !== undefined) {
      data.catatanAdmin = dto.catatanAdmin || null;
    }
    const row = await this.prisma.feedback.update({
      where: { id },
      data,
      include: { user: { select: USER_SELECT } },
    });
    return ok(row, 'Masukan diperbarui');
  }

  // ─── Admin: delete ───────────────────────────────────────────────────

  async remove(id: string): Promise<ResponsePayload<unknown>> {
    await this.ensureExists(id);
    await this.prisma.feedback.delete({ where: { id } });
    return ok({ id }, 'Masukan dihapus');
  }

  // ─── Admin: stats (dashboard widget + badge counter) ─────────────────

  async stats(): Promise<ResponsePayload<unknown>> {
    // One count per known key (5 status + 4 kategori) — cheap and keeps the
    // response map complete (every key present, zero when none). Avoids
    // groupBy's finicky typing in this Prisma version.
    const statusCounts = FEEDBACK_STATUS.map((status) =>
      this.prisma.feedback.count({ where: { status } }),
    );
    const kategoriCounts = FEEDBACK_KATEGORI.map((kategori) =>
      this.prisma.feedback.count({ where: { kategori } }),
    );
    const results = await this.prisma.$transaction([
      this.prisma.feedback.count(),
      ...statusCounts,
      ...kategoriCounts,
    ]);

    let i = 0;
    const total = results[i++];
    const byStatus: Record<string, number> = {};
    for (const s of FEEDBACK_STATUS) byStatus[s] = results[i++];
    const byKategori: Record<string, number> = {};
    for (const k of FEEDBACK_KATEGORI) byKategori[k] = results[i++];

    return ok({ total, byStatus, byKategori }, 'Statistik masukan');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.feedback.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({
        message: `Masukan #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
  }
}
