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
  private readonly sholatHttp: AxiosInstance;
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

    // City list + prayer schedule come from myquran.com (equran.id's /sholat
    // endpoints now 404).
    this.sholatHttp = axios.create({
      baseURL: this.config.get<string>('sholat.baseUrl'),
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
  private async getWithRetry<T>(
    url: string,
    retries = 3,
    client: AxiosInstance = this.http,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data } = await client.get<T>(url);
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
    // The legacy v2 endpoint at `/api/v2/doa` was deprecated and now 404s.
    // The current public catalog lives at `/api/doa` and ships 227 items with
    // the same field shape (id, nama, ar, tr, idn, tentang, grup, tag).
    // Envelope differs ({status, total, data}) but only `.data` matters here.
    const response = await axios.get<{
      status?: unknown;
      total?: number;
      data: EquranDoaItem[];
    }>('https://equran.id/api/doa', {
      timeout: 30_000,
      headers: { Accept: 'application/json', 'User-Agent': 'quran-api/1.0' },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
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

  /**
   * Fetch Uthmani tajwid (colored) text per ayat for one surah from Quran.com
   * API v4 and convert it to namespaced span markup. Returns an empty map when
   * disabled or on failure (seeding continues without tajwid).
   */
  async getAyatTajweed(chapter: number): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (!this.pageEnabled) return out;
    try {
      const { data } = await this.pageHttp.get<{
        verses: Array<{ verse_key: string; text_uthmani_tajweed?: string }>;
      }>(`/quran/verses/uthmani_tajweed`, {
        params: { chapter_number: chapter, per_page: 300 },
      });
      for (const v of data.verses ?? []) {
        const ayat = Number(v.verse_key?.split(':')[1]);
        if (!ayat || !v.text_uthmani_tajweed) continue;
        out.set(ayat, this.transformTajweed(v.text_uthmani_tajweed));
      }
    } catch (error) {
      this.logger.warn(
        `Gagal fetch tajwid surat ${chapter}: ${(error as Error).message}`,
      );
    }
    return out;
  }

  /**
   * Convert Quran.com tajwid markup into sanitised, namespaced span markup:
   *   <tajweed class=RULE>X</tajweed>  ->  <span class="tj tj-RULE">X</span>
   * Verse-end numerals (<span class=end>N</span>) are dropped since the UI
   * renders ayat numbers separately.
   */
  private transformTajweed(html: string): string {
    return html
      .replace(/<span class=end>.*?<\/span>/g, '')
      .replace(
        /<tajweed class=([a-z_]+)>/g,
        (_m, rule: string) => `<span class="tj tj-${rule}">`,
      )
      .replace(/<\/tajweed>/g, '</span>')
      .trim();
  }

  /**
   * Raw kota list payload from myquran.com (`{data:[{id,lokasi}]}`); callers
   * map defensively.
   */
  async getKotaListRaw(): Promise<unknown> {
    return this.getWithRetry<unknown>('/sholat/kota/semua', 3, this.sholatHttp);
  }

  /**
   * Raw monthly jadwal sholat from myquran.com
   * (`/sholat/jadwal/{id}/{year}/{month}` → `{data:{lokasi,daerah,jadwal:[…]}}`);
   * callers map defensively.
   */
  async getJadwalSholat(
    kotaId: string,
    bulan: number,
    tahun: number,
  ): Promise<unknown> {
    return this.getWithRetry<unknown>(
      `/sholat/jadwal/${kotaId}/${tahun}/${bulan}`,
      3,
      this.sholatHttp,
    );
  }
}
