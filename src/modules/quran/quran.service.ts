import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheKey, CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JUZ_START } from './quran.constants';

interface SinceQuery {
  since?: string;
}

function parseSince(since?: string): Date | null {
  if (!since) return null;
  const d = new Date(since);
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class QuranService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  // ─── Audio URL rewriting ────────────────────────────────────────────
  // The DB stores the original upstream (equran CDN) URLs because the audio
  // cache needs to know where to download from. But the public API must NEVER
  // hand those out — clients should always hit our self-hosted streaming proxy
  // (`/audio/stream/...`) which serves from local disk. These helpers rewrite
  // the stored `{ qari: cdnUrl }` maps to proxy URLs at response time.

  private audioBase(): string {
    const prefix = (this.config.get<string>('apiPrefix') ?? 'api/v1').replace(
      /^\/?/,
      '/',
    );
    return `${prefix}/audio/stream`;
  }

  private proxySurahAudio(
    map: unknown,
    suratNomor: number,
  ): Record<string, string> | null {
    if (!map || typeof map !== 'object') return null;
    const base = this.audioBase();
    const out: Record<string, string> = {};
    for (const qari of Object.keys(map as Record<string, unknown>)) {
      out[qari] = `${base}/${qari}/surah/${suratNomor}`;
    }
    return out;
  }

  private proxyAyatAudio(
    map: unknown,
    suratNomor: number,
    nomorAyat: number,
  ): Record<string, string> | null {
    if (!map || typeof map !== 'object') return null;
    const base = this.audioBase();
    const out: Record<string, string> = {};
    for (const qari of Object.keys(map as Record<string, unknown>)) {
      out[qari] = `${base}/${qari}/ayat/${suratNomor}/${nomorAyat}`;
    }
    return out;
  }

  /** Rewrite audioUrls on a single ayat row. `suratNomor` falls back to the
   * row's embedded `surah.nomor` (present on list/search/juz/halaman rows). */
  private mapAyatRow(row: unknown, suratNomor?: number): unknown {
    if (!row || typeof row !== 'object') return row;
    const r = row as {
      nomorAyat?: number;
      audioUrls?: unknown;
      surah?: { nomor?: number };
    };
    const sNomor = suratNomor ?? r.surah?.nomor;
    if (sNomor == null || r.nomorAyat == null || !('audioUrls' in r)) {
      return row;
    }
    return {
      ...(row as Record<string, unknown>),
      audioUrls: this.proxyAyatAudio(r.audioUrls, sNomor, r.nomorAyat),
    };
  }

  async getSuratList(
    query: SinceQuery = {},
  ): Promise<ResponsePayload<unknown>> {
    const since = parseSince(query.since);
    // Delta sync: bypass cache so we never serve stale "no changes" hits.
    if (since) {
      const data = await this.prisma.surah.findMany({
        where: { updatedAt: { gt: since } },
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
          updatedAt: true,
        },
      });
      return ok(
        data.map((s) => ({
          ...s,
          audioFullUrl: this.proxySurahAudio(s.audioFullUrl, s.nomor),
        })),
        'Daftar surat (delta sync)',
        {
          total: data.length,
          since: since.toISOString(),
          cached: false,
        },
      );
    }
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
    const list = (
      data as Array<{ nomor: number; audioFullUrl: unknown }>
    ).map((s) => ({
      ...s,
      audioFullUrl: this.proxySurahAudio(s.audioFullUrl, s.nomor),
    }));
    return ok(list, 'Daftar surat berhasil diambil', {
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
    const surah = data as {
      nomor: number;
      audioFullUrl: unknown;
      ayat: Array<Record<string, unknown>>;
    };
    const mapped = {
      ...surah,
      audioFullUrl: this.proxySurahAudio(surah.audioFullUrl, surah.nomor),
      ayat: surah.ayat.map((a) => this.mapAyatRow(a, surah.nomor)),
    };
    return ok(mapped, 'Detail surat berhasil diambil', {
      total: surah.ayat.length,
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
    return ok(this.mapAyatRow(data), 'Ayat berhasil diambil', { cached });
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
    return ok(
      (data as unknown[]).map((r) => this.mapAyatRow(r)),
      `Ayat juz ${nomor} berhasil diambil`,
      {
        juz: nomor,
        total: (data as unknown[]).length,
        cached,
      },
    );
  }

  async getHalaman(nomor: number): Promise<ResponsePayload<unknown>> {
    if (nomor < 1 || nomor > 604) {
      throw new HttpException(
        { message: 'Nomor halaman harus 1-604', error: 'BAD_REQUEST' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const { data, cached } = await this.redis.remember(
      CacheKey.halaman(nomor),
      CacheTtl.AYAT,
      () =>
        this.prisma.ayat.findMany({
          where: { halaman: nomor },
          orderBy: [{ surahId: 'asc' }, { nomorAyat: 'asc' }],
          include: { surah: { select: { nomor: true, namaLatin: true } } },
        }),
    );
    if ((data as unknown[]).length === 0) {
      // Either an empty page (none exist) or page data not seeded yet.
      throw new NotFoundException({
        message: `Tidak ada ayat untuk halaman ${nomor}. Pastikan data halaman sudah di-seed (QURAN_PAGE_ENABLED).`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      (data as unknown[]).map((r) => this.mapAyatRow(r)),
      `Ayat halaman ${nomor} berhasil diambil`,
      {
        halaman: nomor,
        total: (data as unknown[]).length,
        cached,
      },
    );
  }

  /**
   * Return the 15 sajdah ayat (those marked `sajdah` in the Ayat table).
   * Populated by SeedService.seedSajdah from data/ayat-sajdah.json.
   */
  async getSajdah(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.ayat.findMany({
      where: { sajdah: { not: null } },
      orderBy: [{ surahId: 'asc' }, { nomorAyat: 'asc' }],
      include: { surah: { select: { nomor: true, namaLatin: true } } },
    });
    return ok(
      rows.map((r) => this.mapAyatRow(r)),
      'Daftar ayat sajdah',
      { total: rows.length },
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
    if (!ayat) {
      throw new NotFoundException({
        message: 'Tidak ada ayat yang tersedia',
        error: 'NOT_FOUND',
      });
    }
    return ok(this.mapAyatRow(ayat), 'Ayat random berhasil diambil');
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

    // Track query for analytics (top queries + no-result gaps). Only the
    // first page of each search is logged so paginating-through-the-same-
    // query doesn't inflate the count. Fire-and-forget.
    if (page === 1) {
      void this.prisma.searchLog
        .create({
          data: {
            query: q.toLowerCase().trim().slice(0, 100),
            lang,
            resultCount: total,
          },
        })
        .catch(() => undefined);
    }

    return ok(
      rows.map((r) => this.mapAyatRow(r)),
      `Hasil pencarian "${q}"`,
      {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    );
  }

  /**
   * One-shot dump of the entire Quran (surah + ayat + tafsir Kemenag) so a
   * mobile app can do `GET /quran/dump` ONCE on first install and then read
   * everything offline. Cached aggressively in Redis (24h TTL).
   *
   * Payload is ~10 MB pre-gzip. The `compression` middleware in main.ts
   * applies gzip/br on the wire, so over-the-wire size is closer to ~2 MB.
   */
  async getFullDump(): Promise<unknown> {
    const cacheKey = 'quran:dump:full';
    const cached = await this.redis.get<unknown>(cacheKey);
    if (cached) return cached;

    const surahs = await this.prisma.surah.findMany({
      orderBy: { nomor: 'asc' },
      include: {
        ayat: {
          orderBy: { nomorAyat: 'asc' },
          select: {
            nomorAyat: true,
            teksArab: true,
            teksArabTajwid: true,
            teksLatin: true,
            teksIndonesia: true,
            juz: true,
            halaman: true,
          },
        },
        tafsir: {
          where: { sumber: 'kemenag' },
          include: {
            ayatList: {
              select: {
                ayatId: true,
                teks: true,
                ayat: { select: { nomorAyat: true } },
              },
            },
          },
        },
      },
    });

    // Flatten the tafsir into { nomorAyat → teks } per surah for compactness.
    const dump = surahs.map((s) => {
      const tafsirByAyat: Record<number, string> = {};
      for (const t of s.tafsir) {
        for (const ta of t.ayatList) {
          tafsirByAyat[ta.ayat.nomorAyat] = ta.teks;
        }
      }
      return {
        nomor: s.nomor,
        nama: s.nama,
        namaLatin: s.namaLatin,
        arti: s.arti,
        jumlahAyat: s.jumlahAyat,
        tempatTurun: s.tempatTurun,
        deskripsi: s.deskripsi,
        ayat: s.ayat,
        tafsirKemenag: tafsirByAyat,
      };
    });

    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      totalSurah: dump.length,
      totalAyat: dump.reduce((n, s) => n + s.ayat.length, 0),
      surahs: dump,
    };
    // 24h cache. Re-warm on each seed completion via redis.delByPattern.
    await this.redis.set(cacheKey, payload, 86_400);
    return payload;
  }
}
