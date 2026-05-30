import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { TAFSIR_SOURCES, TafsirSourceMeta } from './tafsir.constants';

interface QuranComTafsirVerse {
  id: number;
  resource_id: number;
  verse_key: string;
  text: string;
}

interface QuranComTafsirResponse {
  tafsirs: QuranComTafsirVerse[];
}

@Injectable()
export class TafsirService {
  private readonly logger = new Logger(TafsirService.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.http = axios.create({
      baseURL:
        this.config.get<string>('quranPage.baseUrl') ??
        'https://api.quran.com/api/v4',
      timeout: 60_000,
      headers: { Accept: 'application/json', 'User-Agent': 'quran-api/1.0' },
    });
  }

  getList(): ResponsePayload<unknown> {
    return ok(
      TAFSIR_SOURCES.map(({ sumber, nama, bahasa }) => ({
        sumber,
        nama,
        bahasa,
      })),
      'Daftar mufassir',
      { total: TAFSIR_SOURCES.length },
    );
  }

  async getTafsirSurat(
    nomor: number,
    sumber: string = 'kemenag',
  ): Promise<ResponsePayload<unknown>> {
    const meta = this.findSourceOrThrow(sumber);
    const { data, cached } = await this.redis.remember(
      `tafsir:${sumber}:${nomor}`,
      CacheTtl.TAFSIR,
      async () => {
        const surah = await this.prisma.surah.findUnique({
          where: { nomor },
          select: { id: true, nomor: true, namaLatin: true, jumlahAyat: true },
        });
        if (!surah) {
          throw new NotFoundException({
            message: `Surat nomor ${nomor} tidak ditemukan`,
            error: 'NOT_FOUND',
          });
        }
        const tafsir = await this.prisma.tafsir.findUnique({
          where: { surahId_sumber: { surahId: surah.id, sumber } },
          include: {
            ayatList: {
              orderBy: { ayat: { nomorAyat: 'asc' } },
              include: { ayat: { select: { nomorAyat: true } } },
            },
          },
        });
        if (!tafsir) {
          throw new NotFoundException({
            message: `Tafsir "${sumber}" untuk surat ${nomor} belum tersedia`,
            error: 'NOT_FOUND',
          });
        }
        return {
          surah,
          sumber: meta,
          tafsir: tafsir.ayatList.map((t) => ({
            ayat: t.ayat.nomorAyat,
            teks: t.teks,
          })),
        };
      },
    );
    return ok(data, 'Tafsir surat berhasil diambil', { cached });
  }

  async getTafsirAyat(
    nomor: number,
    nomorAyat: number,
    sumber: string = 'kemenag',
  ): Promise<ResponsePayload<unknown>> {
    this.findSourceOrThrow(sumber);
    const surah = await this.prisma.surah.findUnique({
      where: { nomor },
      select: { id: true },
    });
    if (!surah) {
      throw new NotFoundException({
        message: `Surat nomor ${nomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const ayat = await this.prisma.ayat.findUnique({
      where: { surahId_nomorAyat: { surahId: surah.id, nomorAyat } },
      select: { id: true },
    });
    if (!ayat) {
      throw new NotFoundException({
        message: `Ayat ${nomorAyat} pada surat ${nomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const entry = await this.prisma.tafsirAyat.findFirst({
      where: { ayatId: ayat.id, tafsir: { sumber } },
    });
    if (!entry) {
      throw new NotFoundException({
        message: `Tafsir "${sumber}" untuk ayat ${nomor}:${nomorAyat} belum tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      { surat: nomor, ayat: nomorAyat, sumber, teks: entry.teks },
      'Tafsir ayat berhasil diambil',
    );
  }

  /**
   * Pull every ayat's tafsir for one source from quran.com and upsert.
   *
   * Uses `/tafsirs/:id/by_chapter/:chapter` (114 GETs, one per surah) rather
   * than `/quran/tafsirs/:id` (which returns aggregated, sometimes empty
   * payloads from quran.com depending on the source). The per-chapter
   * endpoint includes `verse_key` ("S:A") so we can resolve to the correct
   * Ayat row without assuming canonical order.
   */
  async fetchAndStoreSource(source: TafsirSourceMeta): Promise<{
    sumber: string;
    upserted: number;
  }> {
    if (source.quranComId === null) {
      throw new Error(
        `Sumber "${source.sumber}" tidak punya quranComId — tidak bisa di-seed otomatis.`,
      );
    }

    // Build verse_key → (ayatId, surahId) map once.
    const ayatRows = await this.prisma.ayat.findMany({
      select: {
        id: true,
        surahId: true,
        nomorAyat: true,
        surah: { select: { nomor: true } },
      },
    });
    const ayatByKey = new Map<
      string,
      { ayatId: number; surahId: number }
    >();
    for (const a of ayatRows) {
      ayatByKey.set(`${a.surah.nomor}:${a.nomorAyat}`, {
        ayatId: a.id,
        surahId: a.surahId,
      });
    }

    const stripHtml = (s: string) =>
      s
        .replace(/<sup[^>]*>.*?<\/sup>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Ensure one Tafsir row per surah (created on demand).
    const tafsirIdBySurahId = new Map<number, number>();
    const ensureTafsirRow = async (surahId: number): Promise<number> => {
      const cached = tafsirIdBySurahId.get(surahId);
      if (cached) return cached;
      const t = await this.prisma.tafsir.upsert({
        where: { surahId_sumber: { surahId, sumber: source.sumber } },
        create: { surahId, sumber: source.sumber },
        update: {},
        select: { id: true },
      });
      tafsirIdBySurahId.set(surahId, t.id);
      return t.id;
    };

    let totalUpserts = 0;
    for (let surahNomor = 1; surahNomor <= 114; surahNomor++) {
      let verses: QuranComTafsirVerse[] = [];
      try {
        const { data } = await this.http.get<QuranComTafsirResponse>(
          `/tafsirs/${source.quranComId}/by_chapter/${surahNomor}`,
        );
        verses = data.tafsirs ?? [];
      } catch (err) {
        this.logger.warn(
          `Fetch tafsir ${source.sumber} surah ${surahNomor} gagal: ${(err as Error).message}`,
        );
        continue;
      }
      if (verses.length === 0) continue;

      for (const v of verses) {
        const match = ayatByKey.get(v.verse_key);
        if (!match) continue;
        const teks = stripHtml(v.text ?? '');
        if (!teks) continue;
        const tafsirId = await ensureTafsirRow(match.surahId);
        await this.prisma.tafsirAyat.upsert({
          where: {
            tafsirId_ayatId: { tafsirId, ayatId: match.ayatId },
          },
          create: { tafsirId, ayatId: match.ayatId, teks },
          update: { teks },
        });
        totalUpserts++;
      }
    }

    await this.redis.delByPattern(`tafsir:${source.sumber}:*`);
    this.logger.log(
      `Tafsir "${source.sumber}": ${totalUpserts} ayat di ${tafsirIdBySurahId.size} surat`,
    );
    return { sumber: source.sumber, upserted: totalUpserts };
  }

  private findSourceOrThrow(sumber: string): TafsirSourceMeta {
    const src = TAFSIR_SOURCES.find((s) => s.sumber === sumber);
    if (!src) {
      throw new NotFoundException({
        message: `Sumber tafsir "${sumber}" tidak dikenal. Lihat /tafsir/list.`,
        error: 'NOT_FOUND',
      });
    }
    return src;
  }
}
