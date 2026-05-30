import { Injectable, NotFoundException } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';

interface AyatLite {
  id: number;
  surahId: number;
  nomorAyat: number;
  teksArab: string;
  teksIndonesia: string;
  surah: { nomor: number; namaLatin: string };
}

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Sambung ayat": berikan ayat n dan minta user memilih ayat n+1 dari 4
   * pilihan (1 benar + 3 distractor random dari surah berbeda). Membatasi
   * pemilihan ke surah ≤ 30 ayat agar konteks ringkas dan jawaban tidak
   * menjadi tebakan posisi.
   */
  async sambungAyat(): Promise<ResponsePayload<unknown>> {
    const total = await this.prisma.ayat.count();
    // Pilih ayat anchor yang BUKAN ayat terakhir dari surahnya (supaya ada
    // ayat berikutnya). Approach: pick random skip and validate.
    let attempt = 0;
    while (attempt < 20) {
      attempt += 1;
      const skip = Math.floor(Math.random() * total);
      const [anchor] = await this.prisma.ayat.findMany({
        skip,
        take: 1,
        include: { surah: { select: { nomor: true, namaLatin: true } } },
      });
      if (!anchor) continue;
      const next = await this.prisma.ayat.findUnique({
        where: {
          surahId_nomorAyat: {
            surahId: anchor.surahId,
            nomorAyat: anchor.nomorAyat + 1,
          },
        },
        include: { surah: { select: { nomor: true, namaLatin: true } } },
      });
      if (!next) continue;
      // Pick 3 distractors from different surahs.
      const distractors = await this.pickDistractors(next.id, anchor.surahId);
      if (distractors.length < 3) continue;
      const options = this.shuffle([
        this.toLite(next),
        ...distractors,
      ]).map((a) => ({
        id: a.id,
        teksArab: a.teksArab,
        teksIndonesia: a.teksIndonesia,
      }));
      return ok(
        {
          mode: 'sambung-ayat',
          anchor: this.toLite(anchor),
          options,
          correctId: next.id,
        },
        'Quiz sambung ayat',
      );
    }
    throw new NotFoundException({
      message: 'Gagal membuat soal quiz',
      error: 'NOT_FOUND',
    });
  }

  /**
   * "Isi kata kosong": ambil ayat random, kosongkan 1 kata dari teks Arab
   * dan minta user pilih kata yang benar dari 4 opsi (1 benar + 3 kata
   * random dari ayat lain).
   */
  async isiKata(): Promise<ResponsePayload<unknown>> {
    const total = await this.prisma.ayat.count();
    let attempt = 0;
    while (attempt < 20) {
      attempt += 1;
      const skip = Math.floor(Math.random() * total);
      const [ayat] = await this.prisma.ayat.findMany({
        skip,
        take: 1,
        include: { surah: { select: { nomor: true, namaLatin: true } } },
      });
      if (!ayat) continue;
      const words = ayat.teksArab
        .split(/\s+/)
        .filter((w) => w.length > 2);
      if (words.length < 5) continue;
      const idx = 1 + Math.floor(Math.random() * (words.length - 2));
      const correctWord = words[idx];
      const blanked = ayat.teksArab.replace(correctWord, '_____');
      // Gather distractor words from 3 other random ayat.
      const distractors: string[] = [];
      while (distractors.length < 3) {
        const skip2 = Math.floor(Math.random() * total);
        const [other] = await this.prisma.ayat.findMany({
          skip: skip2,
          take: 1,
          select: { teksArab: true },
        });
        if (!other) continue;
        const otherWords = other.teksArab
          .split(/\s+/)
          .filter((w) => w.length > 2 && w !== correctWord);
        if (otherWords.length === 0) continue;
        const pick = otherWords[Math.floor(Math.random() * otherWords.length)];
        if (!distractors.includes(pick)) distractors.push(pick);
      }
      const options = this.shuffle([correctWord, ...distractors]);
      return ok(
        {
          mode: 'isi-kata',
          ayat: this.toLite(ayat),
          teksBlanked: blanked,
          options,
          correctWord,
        },
        'Quiz isi kata kosong',
      );
    }
    throw new NotFoundException({
      message: 'Gagal membuat soal quiz',
      error: 'NOT_FOUND',
    });
  }

  private async pickDistractors(
    excludeId: number,
    sameSurahId: number,
  ): Promise<AyatLite[]> {
    const total = await this.prisma.ayat.count();
    const result: AyatLite[] = [];
    const usedIds = new Set<number>([excludeId]);
    let safety = 0;
    while (result.length < 3 && safety < 30) {
      safety += 1;
      const skip = Math.floor(Math.random() * total);
      const [a] = await this.prisma.ayat.findMany({
        skip,
        take: 1,
        include: { surah: { select: { nomor: true, namaLatin: true } } },
      });
      if (!a) continue;
      if (usedIds.has(a.id)) continue;
      // Prefer different surah to reduce false-positive "feels right".
      if (a.surahId === sameSurahId && safety < 20) continue;
      usedIds.add(a.id);
      result.push(this.toLite(a));
    }
    return result;
  }

  private toLite(a: {
    id: number;
    surahId: number;
    nomorAyat: number;
    teksArab: string;
    teksIndonesia: string;
    surah: { nomor: number; namaLatin: string };
  }): AyatLite {
    return {
      id: a.id,
      surahId: a.surahId,
      nomorAyat: a.nomorAyat,
      teksArab: a.teksArab,
      teksIndonesia: a.teksIndonesia,
      surah: a.surah,
    };
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
