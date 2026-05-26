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
export interface AyatPageInfo {
  /** verse_number within the surah */
  nomorAyat: number;
  page?: number;
  juz?: number;
}

@Injectable()
export class EquranService {
  private readonly logger = new Logger(EquranService.name);
  private readonly http: AxiosInstance;
  private readonly pageHttp: AxiosInstance;
  private readonly delayMs: number;
  private readonly pageEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('equran.baseUrl');
    this.delayMs = this.config.get<number>('equran.requestDelayMs') ?? 250;
    this.http = axios.create({
      baseURL,
      timeout: 20000,
      headers: { Accept: 'application/json', 'User-Agent': 'quran-api/1.0' },
    });

    this.pageEnabled = this.config.get<boolean>('quranPage.enabled') ?? true;
    this.pageHttp = axios.create({
      baseURL: this.config.get<string>('quranPage.baseUrl'),
      timeout: 20000,
      headers: { Accept: 'application/json', 'User-Agent': 'quran-api/1.0' },
    });
  }

  isPageSourceEnabled(): boolean {
    return this.pageEnabled;
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

  /**
   * Fetch page (mushaf) and juz number per ayat for one surah from Quran.com
   * API v4. equran.id v2 does not expose this metadata. Returns [] when the
   * page source is disabled or the request fails (seeding continues).
   */
  async getAyatPageInfo(chapter: number): Promise<AyatPageInfo[]> {
    if (!this.pageEnabled) return [];
    try {
      const { data } = await this.pageHttp.get<{
        verses: Array<{
          verse_number: number;
          page_number?: number;
          juz_number?: number;
        }>;
      }>(`/verses/by_chapter/${chapter}`, {
        params: { fields: 'page_number,juz_number', per_page: 300 },
      });
      return (data.verses ?? []).map((v) => ({
        nomorAyat: v.verse_number,
        page: v.page_number,
        juz: v.juz_number,
      }));
    } catch (error) {
      this.logger.warn(
        `Gagal fetch page info surat ${chapter}: ${(error as Error).message}`,
      );
      return [];
    }
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
