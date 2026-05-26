import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheKey, CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JUZ_START } from './quran.constants';

@Injectable()
export class QuranService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSuratList(): Promise<ResponsePayload<unknown>> {
    const { data, cached } = await this.redis.remember(
      CacheKey.surahList(),
      CacheTtl.SURAH_LIST,
      () =>
        this.prisma.surah.findMany({
          orderBy: { nomor: 'asc' },
          select: {
            id: true,
            nomor: true,
            nama: true,
            namaLatin: true,
            arti: true,
            jumlahAyat: true,
            tempatTurun: true,
            audioFullUrl: true,
          },
        }),
    );
    return ok(data, 'Daftar surat berhasil diambil', {
      total: data.length,
      cached,
    });
  }

  async getSuratDetail(nomor: number): Promise<ResponsePayload<unknown>> {
    const { data, cached } = await this.redis.remember(
      CacheKey.surahDetail(nomor),
      CacheTtl.SURAH_DETAIL,
      async () => {
        const surah = await this.prisma.surah.findUnique({
          where: { nomor },
          include: { ayat: { orderBy: { nomorAyat: 'asc' } } },
        });
        if (!surah) {
          throw new NotFoundException({
            message: `Surat nomor ${nomor} tidak ditemukan`,
            error: 'NOT_FOUND',
          });
        }
        return surah;
      },
    );
    return ok(data, 'Detail surat berhasil diambil', {
      total: (data as { ayat: unknown[] }).ayat.length,
      cached,
    });
  }

  async getAyat(
    nomor: number,
    nomorAyat: number,
  ): Promise<ResponsePayload<unknown>> {
    const { data, cached } = await this.redis.remember(
      CacheKey.ayat(nomor, nomorAyat),
      CacheTtl.AYAT,
      async () => {
        const surah = await this.prisma.surah.findUnique({
          where: { nomor },
        });
        if (!surah) {
          throw new NotFoundException({
            message: `Surat nomor ${nomor} tidak ditemukan`,
            error: 'NOT_FOUND',
          });
        }
        const ayat = await this.prisma.ayat.findUnique({
          where: { surahId_nomorAyat: { surahId: surah.id, nomorAyat } },
        });
        if (!ayat) {
          throw new NotFoundException({
            message: `Ayat ${nomorAyat} pada surat ${nomor} tidak ditemukan`,
            error: 'NOT_FOUND',
          });
        }
        return {
          ...ayat,
          surah: {
            nomor: surah.nomor,
            nama: surah.nama,
            namaLatin: surah.namaLatin,
          },
        };
      },
    );
    return ok(data, 'Ayat berhasil diambil', { cached });
  }

  async getJuz(nomor: number): Promise<ResponsePayload<unknown>> {
    if (nomor < 1 || nomor > 30) {
      throw new HttpException(
        { message: 'Nomor juz harus 1-30', error: 'BAD_REQUEST' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const { data, cached } = await this.redis.remember(
      CacheKey.juz(nomor),
      CacheTtl.AYAT,
      async () => {
        const start = JUZ_START[nomor - 1];
        const end = JUZ_START[nomor];
        const rows = await this.prisma.ayat.findMany({
          where: { surah: { nomor: { gte: start.surah, lte: end.surah } } },
          orderBy: [{ surah: { nomor: 'asc' } }, { nomorAyat: 'asc' }],
          include: { surah: { select: { nomor: true, namaLatin: true } } },
        });
        // Keep only ayat within [start, end) in (surah, ayat) tuple order.
        return rows.filter((r) => {
          const s = r.surah.nomor;
          const a = r.nomorAyat;
          const afterStart =
            s > start.surah || (s === start.surah && a >= start.ayat);
          const beforeEnd = s < end.surah || (s === end.surah && a < end.ayat);
          return afterStart && beforeEnd;
        });
      },
    );
    return ok(data, `Ayat juz ${nomor} berhasil diambil`, {
      juz: nomor,
      total: (data as unknown[]).length,
      cached,
    });
  }

  getHalaman(nomor: number): never {
    // equran.id v2 does not expose mushaf page boundaries, and the schema has
    // no page column, so per-page lookup cannot be served from seeded data.
    throw new HttpException(
      {
        message: `Lookup per halaman (${nomor}) belum tersedia: data batas halaman mushaf tidak disediakan oleh equran.id v2`,
        error: 'NOT_IMPLEMENTED',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  async getRandom(): Promise<ResponsePayload<unknown>> {
    const count = await this.prisma.ayat.count();
    if (count === 0) {
      throw new NotFoundException({
        message: 'Belum ada data ayat. Jalankan seeding terlebih dahulu.',
        error: 'NOT_FOUND',
      });
    }
    const skip = Math.floor(Math.random() * count);
    const [ayat] = await this.prisma.ayat.findMany({
      skip,
      take: 1,
      include: { surah: { select: { nomor: true, nama: true, namaLatin: true } } },
    });
    return ok(ayat, 'Ayat random berhasil diambil');
  }

  async search(dto: SearchQueryDto): Promise<ResponsePayload<unknown>> {
    const { q, lang, page, limit } = dto;
    const field =
      lang === 'arab'
        ? 'teksArab'
        : lang === 'latin'
          ? 'teksLatin'
          : 'teksIndonesia';

    const where: Prisma.AyatWhereInput = {
      [field]: {
        contains: q,
        ...(lang === 'arab' ? {} : { mode: 'insensitive' }),
      },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.ayat.count({ where }),
      this.prisma.ayat.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ surahId: 'asc' }, { nomorAyat: 'asc' }],
        include: {
          surah: { select: { nomor: true, nama: true, namaLatin: true } },
        },
      }),
    ]);

    return ok(rows, `Hasil pencarian "${q}"`, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }
}
