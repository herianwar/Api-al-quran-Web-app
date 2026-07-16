import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { paginationArgs, paginationMeta } from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';

const VALID_ROLES = ['user', 'admin'] as const;
type Role = (typeof VALID_ROLES)[number];
const execAsync = promisify(exec);

interface DiskUsageItem {
  name: string;
  path: string;
  bytes: number;
  pretty: string;
}

interface DiskUsageVps {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPct: number;
  mount: string;
  pretty: { total: string; used: string; available: string };
}

interface DiskUsageInfo {
  app: { totalBytes: number; pretty: string; items: DiskUsageItem[] };
  vps: DiskUsageVps | null;
}

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Auto-promote the bootstrap admin email on startup. Lets you create the
   * first admin without manually editing the DB — sign up via /auth/register
   * with the configured email, then restart (or wait for next boot) and the
   * role is upgraded.
   */
  async onApplicationBootstrap(): Promise<void> {
    const raw = this.config.get<string>('adminBootstrapEmail');
    if (!raw) return;
    // Match stored emails, which are normalized to trimmed-lowercase.
    const email = raw.trim().toLowerCase();
    try {
      const updated = await this.prisma.user.updateMany({
        where: { email, role: { not: 'admin' } },
        data: { role: 'admin' },
      });
      if (updated.count > 0) {
        this.logger.log(`Bootstrap admin promoted: ${email}`);
      }
    } catch (err) {
      this.logger.warn(
        `Admin bootstrap failed (${email}): ${(err as Error).message}`,
      );
    }
  }

  // ─── User management ────────────────────────────────────────────────

  async listUsers(query: AdminUserQueryDto): Promise<ResponsePayload<unknown>> {
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { nama: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.role ? { role: query.role } : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput =
      query.sort === 'oldest'
        ? { createdAt: 'asc' }
        : query.sort === 'email'
          ? { email: 'asc' }
          : { createdAt: 'desc' };
    const { skip, take } = paginationArgs(query);
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          email: true,
          nama: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { bookmarks: true, hafalan: true, deviceTokens: true },
          },
        },
      }),
    ]);
    return ok(users, 'Daftar user', paginationMeta(query, total));
  }

  async setUserRole(
    userId: string,
    role: string,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    if (!(VALID_ROLES as readonly string[]).includes(role)) {
      throw new NotFoundException({
        message: `Role tidak valid. Pilihan: ${VALID_ROLES.join(', ')}`,
        error: 'BAD_REQUEST',
      });
    }
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    const user = await this.prisma.user
      .update({
        where: { id: userId },
        data: { role: role as Role },
        select: { id: true, email: true, nama: true, role: true },
      })
      .catch(() => null);
    if (!user) {
      throw new NotFoundException({
        message: 'User tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    await this.audit.log({
      action: role === 'admin' ? 'user.promote' : 'user.demote',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `user:${user.email}`,
      metadata: { from: before?.role, to: role },
    });
    return ok(user, `Role user diubah menjadi "${role}"`);
  }

  async deleteUser(
    userId: string,
    actor?: { id: string; email: string },
  ): Promise<ResponsePayload<unknown>> {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, nama: true, role: true },
    });
    const result = await this.prisma.user
      .delete({ where: { id: userId } })
      .catch(() => null);
    if (!result) {
      throw new NotFoundException({
        message: 'User tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    await this.audit.log({
      action: 'user.delete',
      actorId: actor?.id,
      actorEmail: actor?.email,
      target: `user:${before?.email}`,
      metadata: before ?? undefined,
    });
    return ok({ deleted: true }, 'User dihapus (cascade ke bookmark/hafalan)');
  }

  // ─── User detail (admin) ─────────────────────────────────────────────

  async getUserDetail(userId: string): Promise<ResponsePayload<unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nama: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        readingProgress: {
          select: {
            surahId: true,
            ayatId: true,
            updatedAt: true,
          },
        },
        bookmarks: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            createdAt: true,
            ayat: {
              select: {
                nomorAyat: true,
                teksIndonesia: true,
                surah: { select: { nomor: true, namaLatin: true } },
              },
            },
          },
        },
        hafalan: {
          orderBy: { lastReviewAt: 'desc' },
          take: 50,
          select: {
            id: true,
            level: true,
            nextReviewAt: true,
            lastReviewAt: true,
            ayat: {
              select: {
                nomorAyat: true,
                surah: { select: { nomor: true, namaLatin: true } },
              },
            },
          },
        },
        deviceTokens: {
          orderBy: { lastSeenAt: 'desc' },
          select: {
            id: true,
            platform: true,
            deviceName: true,
            lastSeenAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException({
        message: 'User tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return ok(user, 'Detail user');
  }

  // ─── Search analytics ────────────────────────────────────────────────

  async getSearchAnalytics(): Promise<ResponsePayload<unknown>> {
    // Top queries (by count) and no-result queries (resultCount = 0).
    const [topQueries, noResults, recent7Days] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ query: string; lang: string; count: bigint; avg_results: number | null }>
      >`
        SELECT query, lang, COUNT(*)::bigint AS count, AVG("resultCount")::float AS avg_results
        FROM search_logs
        GROUP BY query, lang
        ORDER BY count DESC
        LIMIT 30
      `,
      this.prisma.$queryRaw<
        Array<{ query: string; lang: string; count: bigint }>
      >`
        SELECT query, lang, COUNT(*)::bigint AS count
        FROM search_logs
        WHERE "resultCount" = 0
        GROUP BY query, lang
        ORDER BY count DESC
        LIMIT 20
      `,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM search_logs
        WHERE "createdAt" >= NOW() - INTERVAL '7 days'
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    // bigint isn't JSON-serializable — coerce to number.
    const norm = <T extends { count: bigint }>(rows: T[]) =>
      rows.map((r) => ({ ...r, count: Number(r.count) }));

    return ok(
      {
        topQueries: norm(topQueries).map((r) => ({
          ...r,
          avgResults: r.avg_results ? Math.round(r.avg_results * 10) / 10 : 0,
        })),
        noResultQueries: norm(noResults),
        last7Days: recent7Days.map((r) => ({
          day: r.day.toISOString().slice(0, 10),
          count: Number(r.count),
        })),
      },
      'Search analytics',
    );
  }

  // ─── Users analytics ────────────────────────────────────────────────

  async getUsersAnalytics(): Promise<ResponsePayload<unknown>> {
    const [signupsLast30, roleDistribution, activeWithDevice, latestSignups] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
          FROM users
          WHERE "createdAt" >= NOW() - INTERVAL '30 days'
          GROUP BY day
          ORDER BY day ASC
        `,
        this.prisma.user.groupBy({
          by: ['role'],
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(DISTINCT "userId")::bigint AS count
          FROM device_tokens
        `,
        this.prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            email: true,
            nama: true,
            role: true,
            createdAt: true,
            _count: {
              select: { bookmarks: true, hafalan: true, deviceTokens: true },
            },
          },
        }),
      ]);

    // DAU / WAU / MAU — distinct end-users with ANY activity (reading session,
    // bookmark, hafalan, note) in the last 1 / 7 / 30 days.
    const [activeWindows] = await this.prisma.$queryRaw<
      Array<{ dau: bigint; wau: bigint; mau: bigint }>
    >`
      SELECT
        COUNT(DISTINCT uid) FILTER (WHERE ts >= NOW() - INTERVAL '1 day') AS dau,
        COUNT(DISTINCT uid) FILTER (WHERE ts >= NOW() - INTERVAL '7 days') AS wau,
        COUNT(DISTINCT uid) AS mau
      FROM (
        SELECT "userId" uid, "createdAt" ts FROM bookmarks WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        UNION ALL SELECT "userId", "createdAt" FROM hafalan WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        UNION ALL SELECT "userId", "createdAt" FROM reading_sessions WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        UNION ALL SELECT "userId", "createdAt" FROM ayat_notes WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      ) a
    `;

    return ok(
      {
        signupsLast30: signupsLast30.map((r) => ({
          day: r.day.toISOString().slice(0, 10),
          count: Number(r.count),
        })),
        roles: roleDistribution.map((r) => ({
          role: r.role,
          count: r._count._all,
        })),
        activeWithDevice: Number(activeWithDevice[0]?.count ?? 0),
        dau: Number(activeWindows?.dau ?? 0),
        wau: Number(activeWindows?.wau ?? 0),
        mau: Number(activeWindows?.mau ?? 0),
        latestSignups,
      },
      'Users analytics',
    );
  }

  // ─── Content popularity ─────────────────────────────────────────────

  async getContentAnalytics(): Promise<ResponsePayload<unknown>> {
    const [topBookmarked, topMemorized, popularSurahs, hafalanLevels] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{
            ayat_id: number;
            surah_nomor: number;
            surah_nama: string;
            nomor_ayat: number;
            count: bigint;
            teks: string;
          }>
        >`
          SELECT a.id AS ayat_id, s.nomor AS surah_nomor, s."namaLatin" AS surah_nama,
                 a."nomorAyat" AS nomor_ayat, COUNT(b.id)::bigint AS count,
                 a."teksIndonesia" AS teks
          FROM bookmarks b
          JOIN ayat a ON a.id = b."ayatId"
          JOIN surahs s ON s.id = a."surahId"
          GROUP BY a.id, s.nomor, s."namaLatin", a."nomorAyat", a."teksIndonesia"
          ORDER BY count DESC
          LIMIT 20
        `,
        this.prisma.$queryRaw<
          Array<{
            ayat_id: number;
            surah_nomor: number;
            surah_nama: string;
            nomor_ayat: number;
            count: bigint;
            avg_level: number;
          }>
        >`
          SELECT a.id AS ayat_id, s.nomor AS surah_nomor, s."namaLatin" AS surah_nama,
                 a."nomorAyat" AS nomor_ayat, COUNT(h.id)::bigint AS count,
                 AVG(h.level)::float AS avg_level
          FROM hafalan h
          JOIN ayat a ON a.id = h."ayatId"
          JOIN surahs s ON s.id = a."surahId"
          GROUP BY a.id, s.nomor, s."namaLatin", a."nomorAyat"
          ORDER BY count DESC, avg_level DESC
          LIMIT 20
        `,
        this.prisma.$queryRaw<
          Array<{
            nomor: number;
            nama_latin: string;
            bookmarks: bigint;
            hafalan: bigint;
            total: bigint;
          }>
        >`
          SELECT s.nomor, s."namaLatin" AS nama_latin,
                 COALESCE(b.cnt, 0)::bigint AS bookmarks,
                 COALESCE(h.cnt, 0)::bigint AS hafalan,
                 (COALESCE(b.cnt, 0) + COALESCE(h.cnt, 0))::bigint AS total
          FROM surahs s
          LEFT JOIN (
            SELECT a."surahId", COUNT(*) AS cnt
            FROM bookmarks bm JOIN ayat a ON a.id = bm."ayatId"
            GROUP BY a."surahId"
          ) b ON b."surahId" = s.id
          LEFT JOIN (
            SELECT a."surahId", COUNT(*) AS cnt
            FROM hafalan hf JOIN ayat a ON a.id = hf."ayatId"
            GROUP BY a."surahId"
          ) h ON h."surahId" = s.id
          WHERE COALESCE(b.cnt, 0) + COALESCE(h.cnt, 0) > 0
          ORDER BY total DESC
          LIMIT 15
        `,
        this.prisma.hafalan.groupBy({
          by: ['level'],
          _count: { _all: true },
          orderBy: { level: 'asc' },
        }),
      ]);

    const num = (v: unknown): number =>
      typeof v === 'bigint' ? Number(v) : (v as number);

    return ok(
      {
        topBookmarked: topBookmarked.map((r) => ({
          ayatId: r.ayat_id,
          surahNomor: r.surah_nomor,
          surahNama: r.surah_nama,
          nomorAyat: r.nomor_ayat,
          count: num(r.count),
          teks: r.teks,
        })),
        topMemorized: topMemorized.map((r) => ({
          ayatId: r.ayat_id,
          surahNomor: r.surah_nomor,
          surahNama: r.surah_nama,
          nomorAyat: r.nomor_ayat,
          count: num(r.count),
          avgLevel: r.avg_level ? Math.round(r.avg_level * 10) / 10 : 0,
        })),
        popularSurahs: popularSurahs.map((r) => ({
          nomor: r.nomor,
          namaLatin: r.nama_latin,
          bookmarks: num(r.bookmarks),
          hafalan: num(r.hafalan),
          total: num(r.total),
        })),
        hafalanLevels: hafalanLevels.map((r) => ({
          level: r.level,
          count: r._count._all,
        })),
      },
      'Content analytics',
    );
  }

  // ─── Engagement analytics ───────────────────────────────────────────

  async getEngagementAnalytics(): Promise<ResponsePayload<unknown>> {
    const [
      bookmarksTrend,
      hafalanTrend,
      reviewsTrend,
      platformBreakdown,
      broadcastPerformance,
    ] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM bookmarks
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM hafalan
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT DATE_TRUNC('day', "lastReviewAt") AS day, COUNT(*)::bigint AS count
        FROM hafalan
        WHERE "lastReviewAt" >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `,
      this.prisma.deviceToken.groupBy({
        by: ['platform'],
        _count: { _all: true },
      }),
      this.prisma.broadcast.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          attemptedCount: true,
          successCount: true,
          failedCount: true,
          createdAt: true,
        },
      }),
    ]);

    const trend = (rows: Array<{ day: Date; count: bigint }>) =>
      rows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        count: Number(r.count),
      }));

    return ok(
      {
        bookmarksTrend: trend(bookmarksTrend),
        hafalanTrend: trend(hafalanTrend),
        reviewsTrend: trend(reviewsTrend),
        platforms: platformBreakdown.map((p) => ({
          platform: p.platform,
          count: p._count._all,
        })),
        broadcasts: broadcastPerformance.map((b) => ({
          id: b.id,
          title: b.title,
          attempted: b.attemptedCount,
          successful: b.successCount,
          failed: b.failedCount,
          successRate:
            b.attemptedCount > 0
              ? Math.round((b.successCount / b.attemptedCount) * 1000) / 10
              : 0,
          createdAt: b.createdAt,
        })),
      },
      'Engagement analytics',
    );
  }

  // ─── System health ───────────────────────────────────────────────────

  private healthCache: {
    expiresAt: number;
    payload: ResponsePayload<unknown>;
  } | null = null;

  async getSystemHealth(): Promise<ResponsePayload<unknown>> {
    // Memoize: this endpoint runs a recursive walk of the audio-cache dir +
    // a pg_class scan; without caching every poll re-runs that. 15s TTL
    // protects against multi-admin polling + accidental rapid refreshes.
    const now = Date.now();
    if (this.healthCache && this.healthCache.expiresAt > now) {
      return this.healthCache.payload;
    }
    const payload = await this.computeSystemHealth();
    this.healthCache = { expiresAt: now + 15_000, payload };
    return payload;
  }

  private async computeSystemHealth(): Promise<ResponsePayload<unknown>> {
    // DB size + table sizes (Postgres-specific).
    const dbSize = await this.prisma.$queryRaw<Array<{ size: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size
    `;
    const tableSizes = await this.prisma.$queryRaw<
      Array<{ name: string; size: string; rows: bigint }>
    >`
      SELECT
        c.relname AS name,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
        c.reltuples::bigint AS rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 20
    `;

    // Audio cache dir size + file count.
    const audioCacheDir =
      this.config.get<string>('audioCacheDir') ?? '/app/audio-cache';
    let audioCache: {
      bytes: number;
      files: number;
      pretty: string;
    } | null = null;
    try {
      const { bytes, files } = await this.walkDir(audioCacheDir);
      audioCache = { bytes, files, pretty: this.prettyBytes(bytes) };
    } catch {
      audioCache = null;
    }

    // Snapshot count.
    const snapshotDir =
      this.config.get<string>('snapshotDir') ?? '/app/snapshots';
    let snapshotCount = 0;
    try {
      const entries = await fsp.readdir(snapshotDir);
      snapshotCount = entries.filter((n) => n.endsWith('.sql.gz')).length;
    } catch {
      /* ignore */
    }

    // Redis info.
    const redisInfo = this.redis.isHealthy()
      ? await this.fetchRedisInfo()
      : null;

    // Disk usage breakdown (app dir + VPS root).
    const diskInfo = await this.computeDiskUsage();

    return ok(
      {
        database: {
          size: dbSize[0]?.size ?? 'unknown',
          tables: tableSizes.map((t) => ({
            name: t.name,
            size: t.size,
            rows: Number(t.rows),
          })),
        },
        audioCache,
        snapshots: { count: snapshotCount, dir: snapshotDir },
        redis: redisInfo,
        disk: diskInfo,
        node: {
          uptimeSeconds: Math.round(process.uptime()),
          memoryUsage: process.memoryUsage(),
          version: process.version,
          env: this.config.get<string>('nodeEnv'),
        },
      },
      'System health',
    );
  }

  /**
   * Disk usage info untuk admin dashboard.
   *
   * - `app`: breakdown ukuran direktori utama di working dir aplikasi
   *   (data, audio cache, snapshots, .next, node_modules, dist, logs).
   *   Setiap direktori opsional — kalau tidak ada, key-nya tetap muncul
   *   dengan bytes: 0 sehingga UI bisa render konsisten.
   * - `vps`: hasil `df -B1 -P /` — total, used, available, mountpoint.
   *   Jika `df` gagal (sandbox), key-nya null.
   */
  private async computeDiskUsage(): Promise<DiskUsageInfo> {
    const cwd = process.cwd();
    const candidates = [
      { name: 'data', path: join(cwd, 'data') },
      { name: 'audio-cache', path: this.config.get<string>('audioCacheDir') ?? join(cwd, 'data', 'audio-cache') },
      { name: 'snapshots', path: this.config.get<string>('snapshotDir') ?? join(cwd, 'data', 'snapshots') },
      { name: 'frontend-.next', path: join(cwd, 'frontend', '.next') },
      { name: 'node_modules', path: join(cwd, 'node_modules') },
      { name: 'frontend-node_modules', path: join(cwd, 'frontend', 'node_modules') },
      { name: 'dist', path: join(cwd, 'dist') },
      { name: 'logs', path: join(cwd, 'logs') },
      { name: 'public-uploads', path: join(cwd, 'public', 'uploads') },
    ];
    const items: { name: string; path: string; bytes: number; pretty: string }[] = [];
    let totalBytes = 0;
    for (const c of candidates) {
      try {
        const stat = await fsp.stat(c.path);
        if (stat.isDirectory()) {
          const { bytes } = await this.walkDir(c.path);
          items.push({
            name: c.name,
            path: c.path,
            bytes,
            pretty: this.prettyBytes(bytes),
          });
          totalBytes += bytes;
        } else if (stat.isFile()) {
          items.push({
            name: c.name,
            path: c.path,
            bytes: stat.size,
            pretty: this.prettyBytes(stat.size),
          });
          totalBytes += stat.size;
        }
      } catch {
        items.push({ name: c.name, path: c.path, bytes: 0, pretty: '0 B' });
      }
    }
    items.sort((a, b) => b.bytes - a.bytes);

    // df -B1 -P / — POSIX-portable output with single-line column.
    let vps: DiskUsageInfo['vps'] = null;
    try {
      const { stdout } = await execAsync('df -B1 -P /', { timeout: 5000 });
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        // Filesystem 1B-blocks Used Available Capacity Mounted on
        const total = Number(parts[1]);
        const used = Number(parts[2]);
        const available = Number(parts[3]);
        const mount = parts[5] ?? '/';
        const usedPct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
        vps = {
          totalBytes: total,
          usedBytes: used,
          availableBytes: available,
          usedPct,
          mount,
          pretty: {
            total: this.prettyBytes(total),
            used: this.prettyBytes(used),
            available: this.prettyBytes(available),
          },
        };
      }
    } catch (err) {
      this.logger.warn(`df disk-usage gagal: ${(err as Error).message}`);
    }

    return {
      app: {
        totalBytes,
        pretty: this.prettyBytes(totalBytes),
        items,
      },
      vps,
    };
  }

  private async fetchRedisInfo(): Promise<{
    connected: boolean;
    memory?: string;
    keys?: number;
    hitRate?: number;
  }> {
    try {
      const client = this.redis.getClient();
      const info = await client.info('memory');
      const memMatch = /used_memory_human:([^\r\n]+)/.exec(info);
      const dbsize = await client.dbsize();
      const stats = await client.info('stats');
      const hitMatch = /keyspace_hits:(\d+)/.exec(stats);
      const missMatch = /keyspace_misses:(\d+)/.exec(stats);
      const hits = hitMatch ? Number(hitMatch[1]) : 0;
      const misses = missMatch ? Number(missMatch[1]) : 0;
      const total = hits + misses;
      const hitRate = total > 0 ? Math.round((hits / total) * 1000) / 10 : 0;
      return {
        connected: true,
        memory: memMatch?.[1]?.trim(),
        keys: dbsize,
        hitRate,
      };
    } catch {
      return { connected: false };
    }
  }

  private async walkDir(dir: string): Promise<{ bytes: number; files: number }> {
    let bytes = 0;
    let files = 0;
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        const sub = await this.walkDir(full);
        bytes += sub.bytes;
        files += sub.files;
      } else if (e.isFile()) {
        const stat = await fsp.stat(full);
        bytes += stat.size;
        files++;
      }
    }
    return { bytes, files };
  }

  private prettyBytes(bytes: number): string {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let n = bytes;
    let u = 0;
    while (n >= 1024 && u < units.length - 1) {
      n /= 1024;
      u++;
    }
    return `${n.toFixed(n < 10 ? 1 : 0)} ${units[u]}`;
  }

  // ─── System stats ───────────────────────────────────────────────────

  async getStats(): Promise<ResponsePayload<unknown>> {
    const [
      totalUsers,
      totalAdmins,
      totalSurah,
      totalAyat,
      totalTafsir,
      totalTranslation,
      totalDoa,
      totalBookmark,
      totalHafalan,
      totalAsbab,
      totalTopic,
      totalDevices,
      totalPerawi,
      totalHadis,
      totalKota,
      totalJadwalSholat,
      totalAsmaulHusna,
      totalAyatNote,
      totalReadingSession,
      totalNabi,
      totalSirah,
      totalKhutbah,
      totalHadisQudsi,
      totalAyatKata,
      totalShopProduct,
      totalShopCategory,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'admin' } }),
      this.prisma.surah.count(),
      this.prisma.ayat.count(),
      this.prisma.tafsirAyat.count(),
      this.prisma.translation.count(),
      this.prisma.doa.count(),
      this.prisma.bookmark.count(),
      this.prisma.hafalan.count(),
      this.prisma.asbabunNuzul.count(),
      this.prisma.topic.count(),
      this.prisma.deviceToken.count(),
      this.prisma.perawi.count(),
      this.prisma.hadis.count(),
      this.prisma.kota.count(),
      this.prisma.jadwalSholat.count(),
      this.prisma.asmaulHusna.count(),
      this.prisma.ayatNote.count(),
      this.prisma.readingSession.count(),
      this.prisma.nabi.count(),
      this.prisma.sirah.count(),
      this.prisma.khutbah.count(),
      this.prisma.hadisQudsi.count(),
      this.prisma.ayatKata.count(),
      this.prisma.shopProduct.count(),
      this.prisma.shopCategory.count(),
    ]);
    return ok(
      {
        users: { total: totalUsers, admins: totalAdmins },
        content: {
          surah: totalSurah,
          ayat: totalAyat,
          tafsir: totalTafsir,
          translation: totalTranslation,
          doa: totalDoa,
          asbabunNuzul: totalAsbab,
          topic: totalTopic,
          perawi: totalPerawi,
          hadis: totalHadis,
          kota: totalKota,
          jadwalSholat: totalJadwalSholat,
          asmaulHusna: totalAsmaulHusna,
          nabi: totalNabi,
          sirah: totalSirah,
          khutbah: totalKhutbah,
          hadisQudsi: totalHadisQudsi,
          ayatKata: totalAyatKata,
          shopProduct: totalShopProduct,
          shopCategory: totalShopCategory,
        },
        userActivity: {
          bookmark: totalBookmark,
          hafalan: totalHafalan,
          deviceTokens: totalDevices,
          ayatNote: totalAyatNote,
          readingSession: totalReadingSession,
        },
      },
      'Statistik sistem',
    );
  }
}
