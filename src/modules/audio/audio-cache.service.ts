import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createWriteStream, promises as fsp } from 'fs';
import { dirname, join, resolve } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { QARI_LIST } from '../quran/quran.constants';

export interface CachedAudio {
  /** Absolute filesystem path of the cached MP3. */
  path: string;
  /** Size in bytes. */
  size: number;
  /** True when the file was already on disk (cache hit). */
  cached: boolean;
}

/**
 * Lazy CDN proxy + on-disk cache for Quran audio. First request for a given
 * (qari, surah, ayat?) tuple fetches the MP3 from the source URL stored in
 * the DB, writes it to a persistent volume, then streams it. Subsequent
 * requests serve straight from disk — no external dependency after warm-up.
 *
 * Once the cache has been warmed by `seed/audio/warm` (or organically by
 * user traffic), the API is fully self-hosted for audio playback.
 */
@Injectable()
export class AudioCacheService implements OnModuleInit {
  private readonly logger = new Logger(AudioCacheService.name);
  private readonly cacheDir: string;
  // Coalesce concurrent downloads of the same file so we don't fetch the
  // same URL twice when 10 clients hit it simultaneously.
  private readonly inflight = new Map<string, Promise<CachedAudio>>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.cacheDir = resolve(
      this.config.get<string>('audioCacheDir') ?? './audio-cache',
    );
  }

  async onModuleInit(): Promise<void> {
    await fsp.mkdir(this.cacheDir, { recursive: true });
    this.logger.log(`Audio cache dir: ${this.cacheDir}`);
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  normalizeQari(qari?: string): string {
    if (!qari) return '05';
    const padded = qari.padStart(2, '0');
    return QARI_LIST.some((q) => q.id === padded) ? padded : '05';
  }

  /** Resolve filesystem path for a cached surah-full audio file. */
  surahPath(qari: string, surah: number): string {
    return join(
      this.cacheDir,
      qari,
      'surah',
      `${String(surah).padStart(3, '0')}.mp3`,
    );
  }

  /** Resolve filesystem path for a cached single-ayat audio file. */
  ayatPath(qari: string, surah: number, ayat: number): string {
    return join(
      this.cacheDir,
      qari,
      'ayat',
      String(surah).padStart(3, '0'),
      `${String(ayat).padStart(3, '0')}.mp3`,
    );
  }

  /** Get-or-fetch the full-surah audio for `qari`. */
  async getSurah(qari: string, surahNomor: number): Promise<CachedAudio> {
    const qariId = this.normalizeQari(qari);
    const localPath = this.surahPath(qariId, surahNomor);
    return this.getOrFetch(localPath, async () => {
      const surah = await this.prisma.surah.findUnique({
        where: { nomor: surahNomor },
        select: { audioFullUrl: true },
      });
      if (!surah) {
        throw new NotFoundException({
          message: `Surat ${surahNomor} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      const map = (surah.audioFullUrl ?? {}) as Record<string, string>;
      const url = map[qariId];
      if (!url) {
        throw new NotFoundException({
          message: `Audio qari ${qariId} untuk surat ${surahNomor} tidak tersedia`,
          error: 'NOT_FOUND',
        });
      }
      return url;
    });
  }

  /** Get-or-fetch a single-ayat audio for `qari`. */
  async getAyat(
    qari: string,
    surahNomor: number,
    ayatNomor: number,
  ): Promise<CachedAudio> {
    const qariId = this.normalizeQari(qari);
    const localPath = this.ayatPath(qariId, surahNomor, ayatNomor);
    return this.getOrFetch(localPath, async () => {
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
      const ayat = await this.prisma.ayat.findUnique({
        where: {
          surahId_nomorAyat: { surahId: surah.id, nomorAyat: ayatNomor },
        },
        select: { audioUrls: true },
      });
      if (!ayat) {
        throw new NotFoundException({
          message: `Ayat ${ayatNomor} pada surat ${surahNomor} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      const map = (ayat.audioUrls ?? {}) as Record<string, string>;
      const url = map[qariId];
      if (!url) {
        throw new NotFoundException({
          message: `Audio qari ${qariId} untuk ayat ${surahNomor}:${ayatNomor} tidak tersedia`,
          error: 'NOT_FOUND',
        });
      }
      return url;
    });
  }

  // ─── Internal ───────────────────────────────────────────────────────

  private async getOrFetch(
    localPath: string,
    resolveSourceUrl: () => Promise<string>,
  ): Promise<CachedAudio> {
    // Fast path: already cached.
    const existing = await this.statSafe(localPath);
    if (existing && existing.size > 0) {
      return { path: localPath, size: existing.size, cached: true };
    }

    // Coalesce concurrent downloads of the same key.
    const inflight = this.inflight.get(localPath);
    if (inflight) return inflight;

    const promise = (async (): Promise<CachedAudio> => {
      const url = await resolveSourceUrl();
      await this.download(url, localPath);
      const stat = await this.statSafe(localPath);
      if (!stat || stat.size === 0) {
        throw new ServiceUnavailableException({
          message: 'Audio gagal diunduh',
          error: 'SERVICE_UNAVAILABLE',
        });
      }
      return { path: localPath, size: stat.size, cached: false };
    })().finally(() => {
      this.inflight.delete(localPath);
    });

    this.inflight.set(localPath, promise);
    return promise;
  }

  /** Download `url` to `localPath`, atomically (write to .part then rename). */
  private async download(url: string, localPath: string): Promise<void> {
    await fsp.mkdir(dirname(localPath), { recursive: true });
    const tmp = `${localPath}.part`;
    try {
      const response = await axios.get<Readable>(url, {
        responseType: 'stream',
        timeout: 30_000,
        headers: { 'User-Agent': 'quran-api/1.0 audio-cache' },
      });
      await pipeline(response.data, createWriteStream(tmp));
      await fsp.rename(tmp, localPath);
      this.logger.debug(`Cached ${url} → ${localPath}`);
    } catch (error) {
      await fsp.unlink(tmp).catch(() => undefined);
      this.logger.warn(
        `Audio download failed (${url}): ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException({
        message: `Gagal mengunduh audio dari sumber: ${(error as Error).message}`,
        error: 'SERVICE_UNAVAILABLE',
      });
    }
  }

  private async statSafe(p: string): Promise<{ size: number } | null> {
    try {
      const s = await fsp.stat(p);
      return { size: s.size };
    } catch {
      return null;
    }
  }
}
