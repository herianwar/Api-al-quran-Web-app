import { Injectable, NotFoundException } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { QARI_LIST } from '../quran/quran.constants';

@Injectable()
export class AudioService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeQari(qari?: string): string {
    if (!qari) return '05';
    const padded = qari.padStart(2, '0');
    return QARI_LIST.some((q) => q.id === padded) ? padded : '05';
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
    const url = audioMap[qariId] ?? null;
    if (!url) {
      throw new NotFoundException({
        message: `Audio qari ${qariId} untuk surat ${nomor} tidak tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      { nomor: surah.nomor, namaLatin: surah.namaLatin, qari: qariId, url },
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
    const url = audioMap[qariId] ?? null;
    if (!url) {
      throw new NotFoundException({
        message: `Audio qari ${qariId} untuk ayat ini tidak tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      { surat: nomor, ayat: nomorAyat, qari: qariId, url },
      'URL audio ayat berhasil diambil',
    );
  }
}
