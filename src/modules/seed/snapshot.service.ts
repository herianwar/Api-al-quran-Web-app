import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { promises as fsp } from 'fs';
import { join, resolve } from 'path';

export interface SnapshotInfo {
  name: string;
  path: string;
  size: number;
  createdAt: Date;
}

/**
 * Wraps `pg_dump` / `psql` to export and restore the "content" tables of the
 * Quran API (everything that is publicly seedable from external sources).
 * User data (User, Bookmark, Hafalan, RefreshToken, ReadingProgress) is
 * deliberately excluded — those are environment-specific and should never
 * be moved between envs.
 *
 * Workflow:
 *   1. Seed the data once (locally or on VPS).
 *   2. POST /seed/snapshot/export → produces /app/snapshots/quran-<ts>.sql.gz
 *   3. Copy that file to a new env (S3, scp, git LFS, etc).
 *   4. On the new env: POST /seed/snapshot/import with the file path, or
 *      `scripts/restore-snapshot.sh /path/to/file.sql.gz`.
 */
@Injectable()
export class SnapshotService implements OnModuleInit {
  private readonly logger = new Logger(SnapshotService.name);
  private readonly snapshotDir: string;
  private readonly databaseUrl: string;

  /** Tables that hold seed-derived content (safe to move across envs). */
  static readonly CONTENT_TABLES = [
    'surahs',
    'ayat',
    'tafsir',
    'tafsir_ayat',
    'translations',
    'asbabun_nuzul',
    'topics',
    'topic_ayat',
    'doa',
    'kota',
    'jadwal_sholat',
  ];

  constructor(private readonly config: ConfigService) {
    this.snapshotDir = resolve(
      this.config.get<string>('snapshotDir') ?? './snapshots',
    );
    // Strip Prisma-specific query params (e.g. ?schema=public) that vanilla
    // pg_dump/psql don't understand.
    const rawUrl = this.config.get<string>('databaseUrl') ?? '';
    this.databaseUrl = rawUrl.split('?')[0];
  }

  async onModuleInit(): Promise<void> {
    await fsp.mkdir(this.snapshotDir, { recursive: true });
  }

  getDir(): string {
    return this.snapshotDir;
  }

  /** Run pg_dump for content tables → gzipped SQL file. */
  async exportSnapshot(): Promise<SnapshotInfo> {
    if (!this.databaseUrl) {
      throw new InternalServerErrorException({
        message: 'DATABASE_URL belum dikonfigurasi',
        error: 'INTERNAL_ERROR',
      });
    }
    const ts = new Date()
      .toISOString()
      .replace(/[-:T.]/g, '')
      .slice(0, 14); // YYYYMMDDHHMMSS
    const filename = `quran-content-${ts}.sql.gz`;
    const fullPath = join(this.snapshotDir, filename);

    const tableArgs = SnapshotService.CONTENT_TABLES.flatMap((t) => [
      '--table',
      `public.${t}`,
    ]);

    // pg_dump --data-only (no schema; restore relies on migrations already
    // having been applied in the target env). --column-inserts so the dump
    // is robust against column reordering between envs.
    const args = [
      '--data-only',
      '--column-inserts',
      '--disable-triggers',
      '--no-owner',
      '--no-privileges',
      ...tableArgs,
      this.databaseUrl,
    ];

    await this.runPipedToGzip('pg_dump', args, fullPath);
    const stat = await fsp.stat(fullPath);
    this.logger.log(
      `Snapshot exported: ${fullPath} (${(stat.size / 1024).toFixed(1)} KiB)`,
    );
    return {
      name: filename,
      path: fullPath,
      size: stat.size,
      createdAt: stat.mtime,
    };
  }

  /** Restore a snapshot file (.sql.gz). Existing rows are NOT cleared. */
  async importSnapshot(filename: string): Promise<{
    name: string;
    bytes: number;
  }> {
    const safeName = filename.replace(/[\\/]/g, '');
    const fullPath = join(this.snapshotDir, safeName);
    const stat = await fsp.stat(fullPath).catch(() => null);
    if (!stat) {
      throw new NotFoundException({
        message: `Snapshot ${safeName} tidak ditemukan di ${this.snapshotDir}`,
        error: 'NOT_FOUND',
      });
    }
    await this.runGzipPipedToPsql(fullPath);
    this.logger.log(`Snapshot restored from ${fullPath}`);
    return { name: safeName, bytes: stat.size };
  }

  async list(): Promise<SnapshotInfo[]> {
    const entries = await fsp.readdir(this.snapshotDir).catch(() => []);
    const out: SnapshotInfo[] = [];
    for (const name of entries) {
      if (!name.endsWith('.sql.gz')) continue;
      const fullPath = join(this.snapshotDir, name);
      const stat = await fsp.stat(fullPath).catch(() => null);
      if (!stat) continue;
      out.push({ name, path: fullPath, size: stat.size, createdAt: stat.mtime });
    }
    out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return out;
  }

  /**
   * Resolve + validate a snapshot filename for download. Sanitises path
   * traversal and 404s if the file isn't there.
   */
  async getSnapshotForDownload(
    filename: string,
  ): Promise<{ path: string; size: number; name: string }> {
    const safeName = filename.replace(/[\\/]/g, '');
    const fullPath = join(this.snapshotDir, safeName);
    const stat = await fsp.stat(fullPath).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new NotFoundException({
        message: `Snapshot ${safeName} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return { path: fullPath, size: stat.size, name: safeName };
  }

  async deleteSnapshot(filename: string): Promise<void> {
    const safeName = filename.replace(/[\\/]/g, '');
    const fullPath = join(this.snapshotDir, safeName);
    await fsp.unlink(fullPath).catch(() => {
      throw new NotFoundException({
        message: `Snapshot ${safeName} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    });
  }

  // ─── Process helpers ────────────────────────────────────────────────

  /** Spawn `cmd` and pipe stdout through gzip into `outFile`. */
  private runPipedToGzip(
    cmd: string,
    args: string[],
    outFile: string,
  ): Promise<void> {
    return new Promise((resolveProm, rejectProm) => {
      const dumper = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const gzipper = spawn('gzip', ['-c'], { stdio: ['pipe', 'pipe', 'pipe'] });
      const writer = require('fs').createWriteStream(outFile);

      let errBuf = '';
      dumper.stderr.on('data', (d: Buffer) => (errBuf += d.toString()));
      gzipper.stderr.on('data', (d: Buffer) => (errBuf += d.toString()));

      dumper.stdout.pipe(gzipper.stdin);
      gzipper.stdout.pipe(writer);

      let dumperExit: number | null = null;
      let gzipperExit: number | null = null;
      let writerDone = false;

      const finalize = () => {
        if (
          dumperExit === null ||
          gzipperExit === null ||
          !writerDone
        ) {
          return;
        }
        if (dumperExit === 0 && gzipperExit === 0) resolveProm();
        else
          rejectProm(
            new Error(
              `pg_dump exit ${dumperExit}, gzip exit ${gzipperExit}: ${errBuf.trim()}`,
            ),
          );
      };

      dumper.on('close', (code) => {
        dumperExit = code ?? 1;
        finalize();
      });
      gzipper.on('close', (code) => {
        gzipperExit = code ?? 1;
        finalize();
      });
      writer.on('finish', () => {
        writerDone = true;
        finalize();
      });
      writer.on('error', rejectProm);
      dumper.on('error', rejectProm);
      gzipper.on('error', rejectProm);
    });
  }

  /** gunzip `inFile` and pipe into psql against the configured DATABASE_URL. */
  private runGzipPipedToPsql(inFile: string): Promise<void> {
    return new Promise((resolveProm, rejectProm) => {
      const reader = require('fs').createReadStream(inFile);
      const gunzip = spawn('gunzip', ['-c'], { stdio: ['pipe', 'pipe', 'pipe'] });
      const psql = spawn(
        'psql',
        [
          // ON_ERROR_STOP so the first SQL error aborts the restore rather
          // than logging and continuing (which would leave partial data).
          '-v',
          'ON_ERROR_STOP=1',
          '--quiet',
          this.databaseUrl,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      let errBuf = '';
      gunzip.stderr.on('data', (d: Buffer) => (errBuf += d.toString()));
      psql.stderr.on('data', (d: Buffer) => (errBuf += d.toString()));

      reader.pipe(gunzip.stdin);
      gunzip.stdout.pipe(psql.stdin);

      let gunzipExit: number | null = null;
      let psqlExit: number | null = null;

      const finalize = () => {
        if (gunzipExit === null || psqlExit === null) return;
        if (gunzipExit === 0 && psqlExit === 0) resolveProm();
        else
          rejectProm(
            new Error(
              `gunzip exit ${gunzipExit}, psql exit ${psqlExit}: ${errBuf.trim()}`,
            ),
          );
      };

      gunzip.on('close', (code) => {
        gunzipExit = code ?? 1;
        finalize();
      });
      psql.on('close', (code) => {
        psqlExit = code ?? 1;
        finalize();
      });
      reader.on('error', rejectProm);
      gunzip.on('error', rejectProm);
      psql.on('error', rejectProm);
    });
  }
}
