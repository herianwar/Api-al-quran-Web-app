import { Injectable, NotFoundException } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AyatNoteQueryDto,
  CreateAyatNoteDto,
  UpdateAyatNoteDto,
} from './dto/ayat-note.dto';

@Injectable()
export class AyatNoteService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: AyatNoteQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const { skip, take } = paginationArgs(query);
    const where = { userId, ...(query.ayatId ? { ayatId: query.ayatId } : {}) };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.ayatNote.count({ where }),
      this.prisma.ayatNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          ayat: {
            select: {
              id: true,
              nomorAyat: true,
              teksArab: true,
              teksIndonesia: true,
              surah: { select: { nomor: true, namaLatin: true } },
            },
          },
        },
      }),
    ]);
    return ok(rows, 'Daftar catatan ayat', paginationMeta(query, total));
  }

  async listForAyat(
    userId: string,
    ayatId: number,
  ): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.ayatNote.findMany({
      where: { userId, ayatId },
      orderBy: { createdAt: 'desc' },
    });
    return ok(rows, 'Catatan untuk ayat ini', { total: rows.length });
  }

  async create(
    userId: string,
    dto: CreateAyatNoteDto,
  ): Promise<ResponsePayload<unknown>> {
    const ayat = await this.prisma.ayat.findUnique({
      where: { id: dto.ayatId },
      select: { id: true },
    });
    if (!ayat) {
      throw new NotFoundException({
        message: `Ayat #${dto.ayatId} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const note = await this.prisma.ayatNote.create({
      data: {
        userId,
        ayatId: dto.ayatId,
        judul: dto.judul ?? null,
        body: dto.body,
      },
    });
    return ok(note, 'Catatan ayat berhasil dibuat');
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAyatNoteDto,
  ): Promise<ResponsePayload<unknown>> {
    // Scoped updateMany so user A cannot edit user B's note by guessing id.
    const result = await this.prisma.ayatNote.updateMany({
      where: { id, userId },
      data: {
        ...(dto.judul !== undefined ? { judul: dto.judul } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
      },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        message: 'Catatan tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    const fresh = await this.prisma.ayatNote.findUnique({ where: { id } });
    return ok(fresh, 'Catatan diperbarui');
  }

  async remove(
    userId: string,
    id: string,
  ): Promise<ResponsePayload<unknown>> {
    const result = await this.prisma.ayatNote.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        message: 'Catatan tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok({ deleted: true }, 'Catatan dihapus');
  }
}
