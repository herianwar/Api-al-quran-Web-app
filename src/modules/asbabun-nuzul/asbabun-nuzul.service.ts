import { Injectable, NotFoundException } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class AsbabunNuzulService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** All asbabun nuzul entries for a surah, ordered by ayat number. */
  async getBySurah(surahNomor: number): Promise<ResponsePayload<unknown>> {
    const cacheKey = `asbab:surah:${surahNomor}`;
    const { data, cached } = await this.redis.remember(
      cacheKey,
      CacheTtl.AYAT,
      async () => {
        const surah = await this.prisma.surah.findUnique({
          where: { nomor: surahNomor },
          select: { id: true, nomor: true, namaLatin: true },
        });
        if (!surah) {
          throw new NotFoundException({
            message: `Surat ${surahNomor} tidak ditemukan`,
            error: 'NOT_FOUND',
          });
        }
        const rows = await this.prisma.asbabunNuzul.findMany({
          where: { ayat: { surahId: surah.id } },
          orderBy: { ayat: { nomorAyat: 'asc' } },
          select: {
            id: true,
            teks: true,
            sumber: true,
            ayat: { select: { nomorAyat: true } },
          },
        });
        return {
          surah,
          entries: rows.map((r) => ({
            nomorAyat: r.ayat.nomorAyat,
            teks: r.teks,
            sumber: r.sumber,
          })),
        };
      },
    );
    return ok(data, `Asbabun nuzul surat ${surahNomor}`, {
      total: (data as { entries: unknown[] }).entries.length,
      cached,
    });
  }

  /** Asbabun nuzul entries for a single ayat (may be multiple sources). */
  async getByAyat(
    surahNomor: number,
    nomorAyat: number,
  ): Promise<ResponsePayload<unknown>> {
    const surah = await this.prisma.surah.findUnique({
      where: { nomor: surahNomor },
      select: { id: true },
    });
    if (!surah) {
      throw new NotFoundException({
        message: `Surat ${surahNomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const rows = await this.prisma.asbabunNuzul.findMany({
      where: {
        ayat: { surahId: surah.id, nomorAyat },
      },
      orderBy: { sumber: 'asc' },
      select: { id: true, teks: true, sumber: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException({
        message: `Asbabun nuzul untuk ${surahNomor}:${nomorAyat} belum tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(rows, `Asbabun nuzul ${surahNomor}:${nomorAyat}`, {
      total: rows.length,
    });
  }
}
