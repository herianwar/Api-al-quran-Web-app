import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { QARI_LIST } from '../quran/quran.constants';

@Injectable()
export class AudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private normalizeQari(qari?: string): string {
    if (!qari) return '05';
    const padded = qari.padStart(2, '0');
    return QARI_LIST.some((q) => q.id === padded) ? padded : '05';
  }

  /** Relative URL to our self-hosted streaming proxy. */
  private streamUrl(parts: string[]): string {
    const prefix = (this.config.get<string>('apiPrefix') ?? 'api/v1').replace(
      /^\/?/,
      '/',
    );
    return `${prefix}/audio/stream/${parts.join('/')}`;
  }

  getQariList(): ResponsePayload<unknown> {
    return ok(QARI_LIST, 'Daftar qari tersedia');
  }

  async getSuratAudio(
    nomor: number,
    qari?: string,
  ): Promise<ResponsePayload<unknown>> {
    const qariId = this.normalizeQari(qari);
    const surah = await this.prisma.surah.findUnique({
      where: { nomor },
      select: { nomor: true, namaLatin: true, audioFullUrl: true },
    });
    if (!surah) {
      throw new NotFoundException({
        message: `Surat nomor ${nomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const audioMap = (surah.audioFullUrl ?? {}) as Record<string, string>;
    const sourceUrl = audioMap[qariId] ?? null;
    if (!sourceUrl) {
      throw new NotFoundException({
        message: `Audio qari ${qariId} untuk surat ${nomor} tidak tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      {
        nomor: surah.nomor,
        namaLatin: surah.namaLatin,
        qari: qariId,
        // Self-hosted proxy URL streamed from our own disk cache — this is the
        // only audio URL exposed to clients. The upstream CDN origin is kept in
        // the DB (for the cache to download from) but never returned.
        url: this.streamUrl([qariId, 'surah', String(nomor)]),
        selfHosted: true,
      },
      'URL audio surat berhasil diambil',
    );
  }

  async getAyatAudio(
    nomor: number,
    nomorAyat: number,
    qari?: string,
  ): Promise<ResponsePayload<unknown>> {
    const qariId = this.normalizeQari(qari);
    const surah = await this.prisma.surah.findUnique({ where: { nomor } });
    if (!surah) {
      throw new NotFoundException({
        message: `Surat nomor ${nomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const ayat = await this.prisma.ayat.findUnique({
      where: { surahId_nomorAyat: { surahId: surah.id, nomorAyat } },
      select: { nomorAyat: true, audioUrls: true },
    });
    if (!ayat) {
      throw new NotFoundException({
        message: `Ayat ${nomorAyat} pada surat ${nomor} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const audioMap = (ayat.audioUrls ?? {}) as Record<string, string>;
    const sourceUrl = audioMap[qariId] ?? null;
    if (!sourceUrl) {
      throw new NotFoundException({
        message: `Audio qari ${qariId} untuk ayat ini tidak tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      {
        surat: nomor,
        ayat: nomorAyat,
        qari: qariId,
        url: this.streamUrl([qariId, 'ayat', String(nomor), String(nomorAyat)]),
        selfHosted: true,
      },
      'URL audio ayat berhasil diambil',
    );
  }
}
