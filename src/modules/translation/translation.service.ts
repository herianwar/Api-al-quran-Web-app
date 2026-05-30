import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { TRANSLATION_SOURCES, TranslationSource } from './translation.constants';

interface QuranComTranslationVerse {
  resource_id: number;
  text: string;
}

interface QuranComTranslationResponse {
  translations: QuranComTranslationVerse[];
  meta?: { translation_name?: string };
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
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
      timeout: 30_000,
      headers: { Accept: 'application/json', 'User-Agent': 'quran-api/1.0' },
    });
  }

  listSources(): ResponsePayload<unknown> {
    return ok(
      TRANSLATION_SOURCES.map(({ sumber, bahasa, penerjemah }) => ({
        sumber,
        bahasa,
        penerjemah,
      })),
      'Daftar sumber terjemahan',
      { total: TRANSLATION_SOURCES.length },
    );
  }

  async getSurat(
    sumber: string,
    surahNomor: number,
  ): Promise<ResponsePayload<unknown>> {
    const source = this.findSourceOrThrow(sumber);
    const cacheKey = `translation:${sumber}:surah:${surahNomor}`;
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
        const rows = await this.prisma.translation.findMany({
          where: { sumber, ayat: { surahId: surah.id } },
          orderBy: { ayat: { nomorAyat: 'asc' } },
          select: {
            id: true,
            teks: true,
            ayat: { select: { nomorAyat: true } },
          },
        });
        return {
          surah,
          sumber: source,
          ayat: rows.map((r) => ({
            nomorAyat: r.ayat.nomorAyat,
            teks: r.teks,
          })),
        };
      },
    );
    return ok(data, `Terjemahan "${sumber}" surat ${surahNomor}`, {
      total: (data as { ayat: unknown[] }).ayat.length,
      cached,
    });
  }

  async getAyat(
    sumber: string,
    surahNomor: number,
    ayatNomor: number,
  ): Promise<ResponsePayload<unknown>> {
    const source = this.findSourceOrThrow(sumber);
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
    const row = await this.prisma.translation.findFirst({
      where: {
        sumber,
        ayat: { surahId: surah.id, nomorAyat: ayatNomor },
      },
      select: {
        teks: true,
        ayat: { select: { nomorAyat: true, teksArab: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Terjemahan ${sumber} untuk ayat ${surahNomor}:${ayatNomor} belum tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      {
        sumber: source,
        surah: surahNomor,
        ayat: ayatNomor,
        teksArab: row.ayat.teksArab,
        terjemah: row.teks,
      },
      'Terjemahan ayat',
    );
  }

  /**
   * Download a translation source from quran.com and upsert into our DB.
   *
   * quran.com /quran/translations/:id returns verses in canonical order
   * (1:1, 1:2, …, 114:6) without a per-verse key. We pair them by **index**
   * against our local ayat rows fetched in the same canonical order. The
   * total must equal 6236 — if not, we abort to avoid silent misalignment.
   */
  async fetchAndStoreSource(source: TranslationSource): Promise<{
    sumber: string;
    upserted: number;
  }> {
    const { data } = await this.http.get<QuranComTranslationResponse>(
      `/quran/translations/${source.quranComId}`,
    );
    const verses = data.translations ?? [];

    const ayatRows = await this.prisma.ayat.findMany({
      orderBy: [{ surah: { nomor: 'asc' } }, { nomorAyat: 'asc' }],
      select: { id: true },
    });

    if (verses.length !== ayatRows.length) {
      throw new Error(
        `Mismatch panjang: quran.com=${verses.length} vs DB ayat=${ayatRows.length}. ` +
          `Tidak meng-upsert untuk menghindari misalignment.`,
      );
    }

    // Strip the inline footnote refs that quran.com inserts as <sup foot_note=…>.
    const stripHtml = (s: string) =>
      s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    let totalUpserts = 0;
    for (let i = 0; i < verses.length; i++) {
      const v = verses[i];
      const ayatId = ayatRows[i].id;
      await this.prisma.translation.upsert({
        where: { ayatId_sumber: { ayatId, sumber: source.sumber } },
        create: {
          ayatId,
          bahasa: source.bahasa,
          sumber: source.sumber,
          penerjemah: source.penerjemah,
          teks: stripHtml(v.text),
        },
        update: {
          bahasa: source.bahasa,
          penerjemah: source.penerjemah,
          teks: stripHtml(v.text),
        },
      });
      totalUpserts++;
    }

    await this.redis.delByPattern(`translation:${source.sumber}:*`);
    this.logger.log(`Translation "${source.sumber}": ${totalUpserts} ayat`);
    return { sumber: source.sumber, upserted: totalUpserts };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private findSourceOrThrow(sumber: string): TranslationSource {
    const src = TRANSLATION_SOURCES.find((s) => s.sumber === sumber);
    if (!src) {
      throw new NotFoundException({
        message: `Sumber terjemahan "${sumber}" tidak dikenal. Lihat /translation/list.`,
        error: 'NOT_FOUND',
      });
    }
    return src;
  }

}
