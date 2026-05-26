import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  EquranDoaItem,
  EquranEnvelope,
  EquranSuratDetail,
  EquranSuratListItem,
  EquranTafsirDetail,
} from './equran.types';

/** HTTP client for equran.id API v2 (used by seeding + lazy sholat fetch). */
@Injectable()
export class EquranService {
  private readonly logger = new Logger(EquranService.name);
  private readonly http: AxiosInstance;
  private readonly delayMs: number;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('equran.baseUrl');
    this.delayMs = this.config.get<number>('equran.requestDelayMs') ?? 250;
    this.http = axios.create({
      baseURL,
      timeout: 20000,
      headers: { Accept: 'application/json', 'User-Agent': 'quran-api/1.0' },
    });
  }

  delay(ms = this.delayMs): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** GET with a small retry/backoff for transient network/5xx failures. */
  private async getWithRetry<T>(url: string, retries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data } = await this.http.get<T>(url);
        return data;
      } catch (error) {
        lastError = error;
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        // Do not retry client errors (4xx) other than 429.
        if (status && status >= 400 && status < 500 && status !== 429) {
          break;
        }
        this.logger.warn(
          `GET ${url} failed (attempt ${attempt}/${retries}): ${(error as Error).message}`,
        );
        if (attempt < retries) {
          await this.delay(this.delayMs * attempt * 2);
        }
      }
    }
    throw new HttpException(
      `Gagal mengambil data dari equran.id: ${url}`,
      502,
    );
  }

  async getSuratList(): Promise<EquranSuratListItem[]> {
    const res =
      await this.getWithRetry<EquranEnvelope<EquranSuratListItem[]>>('/surat');
    return res.data;
  }

  async getSuratDetail(nomor: number): Promise<EquranSuratDetail> {
    const res = await this.getWithRetry<EquranEnvelope<EquranSuratDetail>>(
      `/surat/${nomor}`,
    );
    return res.data;
  }

  async getTafsir(nomor: number): Promise<EquranTafsirDetail> {
    const res = await this.getWithRetry<EquranEnvelope<EquranTafsirDetail>>(
      `/tafsir/${nomor}`,
    );
    return res.data;
  }

  async getDoa(): Promise<EquranDoaItem[]> {
    const res = await this.getWithRetry<EquranEnvelope<EquranDoaItem[]>>(
      '/doa',
    );
    return res.data;
  }

  /** Raw kota list payload; shape varies, callers map defensively. */
  async getKotaListRaw(): Promise<unknown> {
    return this.getWithRetry<unknown>('/sholat/kota');
  }

  /** Raw jadwal sholat payload; shape varies, callers map defensively. */
  async getJadwalSholat(
    kotaId: string,
    bulan: number,
    tahun: number,
  ): Promise<unknown> {
    return this.getWithRetry<unknown>(
      `/sholat/kota/${kotaId}/${bulan}/${tahun}`,
    );
  }
}
