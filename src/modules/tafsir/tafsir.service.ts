import { Injectable, NotFoundException } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheKey, CacheTtl } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';

const MUFASSIR = [
  { sumber: 'kemenag', nama: 'Kementerian Agama RI', bahasa: 'id' },
];

@Injectable()
export class TafsirService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getList(): ResponsePayload<unknown> {
    return ok(MUFASSIR, 'Daftar mufassir');
  }

  async getTafsirSurat(nomor: number): Promise<ResponsePayload<unknown>> {
    const { data, cached } = await this.redis.remember(
      CacheKey.tafsir(nomor),
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
          where: { surahId_sumber: { surahId: surah.id, sumber: 'kemenag' } },
          include: {
            ayatList: {
              orderBy: { ayat: { nomorAyat: 'asc' } },
              include: { ayat: { select: { nomorAyat: true } } },
            },
          },
        });
        if (!tafsir) {
          throw new NotFoundException({
            message: `Tafsir untuk surat ${nomor} belum tersedia`,
            error: 'NOT_FOUND',
          });
        }
        return {
          surah,
          sumber: tafsir.sumber,
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
  ): Promise<ResponsePayload<unknown>> {
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
      where: { ayatId: ayat.id, tafsir: { sumber: 'kemenag' } },
    });
    if (!entry) {
      throw new NotFoundException({
        message: `Tafsir ayat ${nomorAyat} surat ${nomor} belum tersedia`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      { surat: nomor, ayat: nomorAyat, sumber: 'kemenag', teks: entry.teks },
      'Tafsir ayat berhasil diambil',
    );
  }
}
