import { BadRequestException, Injectable } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  HIJRI_MONTH_NAMES_AR,
  HIJRI_MONTH_NAMES_ID,
  gregorianStringToHijri,
  hijriStringToGregorian,
} from './hijri.converter';

@Injectable()
export class HijriService {
  today(): ResponsePayload<unknown> {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const out = gregorianStringToHijri(iso);
    return ok(out, 'Tanggal hari ini (Hijri & Masehi)');
  }

  fromGregorian(iso: string): ResponsePayload<unknown> {
    try {
      const out = gregorianStringToHijri(iso);
      return ok(out, 'Konversi Masehi → Hijri');
    } catch (err) {
      throw new BadRequestException({
        message: (err as Error).message,
        error: 'BAD_REQUEST',
      });
    }
  }

  fromHijri(iso: string): ResponsePayload<unknown> {
    try {
      const out = hijriStringToGregorian(iso);
      return ok(out, 'Konversi Hijri → Masehi');
    } catch (err) {
      throw new BadRequestException({
        message: (err as Error).message,
        error: 'BAD_REQUEST',
      });
    }
  }

  months(): ResponsePayload<unknown> {
    const items = HIJRI_MONTH_NAMES_ID.map((nama, i) => ({
      nomor: i + 1,
      nama,
      namaArab: HIJRI_MONTH_NAMES_AR[i],
    }));
    return ok(items, 'Daftar 12 bulan Hijriah');
  }
}
