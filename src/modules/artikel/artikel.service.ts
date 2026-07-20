import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  BulkArtikelDto,
  CreateArtikelDto,
  CreateKategoriDto,
  ArtikelListQueryDto,
  UpdateArtikelDto,
  UpdateKategoriDto,
} from './dto/artikel.dto';
import {
  estimateReadingMinutes,
  extractArtikelUploadUrls,
  htmlToText,
  sanitizeArticleHtml,
} from './html-sanitize';
import { variantFilename } from '../../common/util/image';

/** Where article cover/inline uploads live on disk. Served at /uploads/artikel
 *  via the static-assets mount in main.ts (same scheme as the shop module). */
export const ARTIKEL_UPLOAD_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'uploads',
  'artikel',
);

/** Cover width variants generated on upload (px). 400 = list card thumb,
 *  800 = detail hero. Kept here so the upload handler and the backfill
 *  script share one source of truth. */
export const ARTIKEL_COVER_WIDTHS = [400, 800] as const;
export const ARTIKEL_THUMB_WIDTH = 400;
export const ARTIKEL_HERO_WIDTH = 800;

/** Public fields returned in list responses (no full body — keeps payload light). */
const LIST_SELECT = {
  id: true,
  slug: true,
  judul: true,
  ringkasan: true,
  coverUrl: true,
  coverAlt: true,
  penulis: true,
  status: true,
  isFeatured: true,
  tags: true,
  menitBaca: true,
  views: true,
  publishedAt: true,
  scheduledAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, slug: true, nama: true } },
} satisfies Prisma.ArtikelSelect;

@Injectable()
export class ArtikelService implements OnModuleInit, OnModuleDestroy {
  /** Public base URL (e.g. https://rumahquran.id) used to turn stored
   *  /uploads/... paths into absolute media links for API clients (the
   *  Flutter app can't resolve relative paths). Empty → paths stay relative. */
  private readonly publicBase: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly notifications: NotificationService,
  ) {
    this.publicBase = (config.get<string>('apiPublicUrl') ?? '').replace(
      /\/+$/,
      '',
    );
  }

  /** Turn a stored "/uploads/..." path into an absolute URL when a public
   *  base is configured. Leaves already-absolute or empty values untouched. */
  private absUrl(url?: string | null): string | null {
    if (!url) return url ?? null;
    if (!this.publicBase || /^https?:\/\//i.test(url)) return url;
    return url.startsWith('/') ? `${this.publicBase}${url}` : url;
  }

  /** Absolutize a row's coverUrl (shallow clone so we never mutate Prisma's). */
  private withAbsCover<T extends { coverUrl?: string | null }>(row: T): T {
    return { ...row, coverUrl: this.absUrl(row.coverUrl) };
  }

  /**
   * Derive the URL of a cover width variant, or null when one can't exist.
   *
   * Variants are only produced for our own WebP uploads under
   * /uploads/artikel/ (see generateWidthVariants on upload). External or
   * non-WebP covers have no sibling, so we return null and let the client
   * fall back to `coverUrl`. Old uploads with no variant on disk yet are
   * covered by the one-off backfill script — until it runs they'd 404, which
   * is why the client must treat these fields as optional.
   */
  private coverVariantUrl(
    coverUrl: string | null | undefined,
    width: number,
  ): string | null {
    if (!coverUrl) return null;
    if (/^https?:\/\//i.test(coverUrl)) return null; // external
    if (!coverUrl.startsWith('/uploads/artikel/')) return null;
    if (!coverUrl.toLowerCase().endsWith('.webp')) return null; // gif/legacy
    const idx = coverUrl.lastIndexOf('/') + 1;
    const dir = coverUrl.slice(0, idx);
    const variant = variantFilename(coverUrl.slice(idx), width);
    return this.absUrl(`${dir}${variant}`);
  }

  /**
   * Attach absolute `coverUrl` plus derived `coverThumbUrl` (400w, list cards)
   * and `coverHeroUrl` (800w, detail hero). Both new fields are additive —
   * `coverUrl` is untouched so older app builds keep working.
   */
  private withCoverVariants<T extends { coverUrl?: string | null }>(
    row: T,
  ): T & { coverThumbUrl: string | null; coverHeroUrl: string | null } {
    const raw = row.coverUrl;
    return {
      ...row,
      coverUrl: this.absUrl(raw),
      coverThumbUrl: this.coverVariantUrl(raw, ARTIKEL_THUMB_WIDTH),
      coverHeroUrl: this.coverVariantUrl(raw, ARTIKEL_HERO_WIDTH),
    };
  }

  /** Rewrite inline <img src="/uploads/artikel/..."> in body HTML to absolute
   *  URLs so the article renders correctly inside the mobile app. */
  private absBody(html: string): string {
    if (!this.publicBase) return html;
    return html.replace(
      /(src=["'])(\/uploads\/artikel\/)/gi,
      `$1${this.publicBase}$2`,
    );
  }

  /** Build + send a "new article" push to every registered device. Called
   *  fire-and-forget the first time an article goes live (no-op when FCM is
   *  unconfigured; never blocks or fails the create/update request). */
  private async notifyPublished(row: {
    judul: string;
    slug: string;
    ringkasan: string | null;
    coverUrl: string | null;
  }): Promise<void> {
    const data: Record<string, string> = {
      type: 'artikel',
      slug: row.slug,
      deeplink: `/artikel/${row.slug}`,
    };
    const cover = this.absUrl(row.coverUrl);
    if (cover) data.image = cover; // kept in data too for the app's tap handler
    await this.notifications.sendBroadcast({
      title: row.judul,
      body: (row.ringkasan ?? '').trim().slice(0, 160) || 'Artikel baru telah terbit.',
      data,
      imageUrl: cover ?? undefined, // big-picture on the notification itself
    });
  }

  /** Recent (ip→slug) view keys → expiry ms, so a refresh doesn't inflate the
   *  counter. In-memory is fine for the single-instance deployment; entries
   *  self-expire and the map is swept opportunistically. */
  private readonly viewSeen = new Map<string, number>();
  private static readonly VIEW_WINDOW_MS = 30 * 60_000; // 30 min

  /** @returns true if this ip+slug should count as a fresh view. */
  private shouldCountView(ip: string, slug: string): boolean {
    const now = Date.now();
    const key = `${ip || 'anon'}:${slug}`;
    const seen = this.viewSeen.get(key);
    if (seen && seen > now) return false;
    this.viewSeen.set(key, now + ArtikelService.VIEW_WINDOW_MS);
    // Opportunistic sweep so the map can't grow unbounded.
    if (this.viewSeen.size > 5000) {
      for (const [k, exp] of this.viewSeen) {
        if (exp <= now) this.viewSeen.delete(k);
      }
    }
    return true;
  }

  // ─── View counter (buffered, never touches updatedAt) ────────────────
  // Two rules govern this counter:
  //
  //  1. It must NOT bump `updatedAt`. That column is the delta-sync cursor
  //     for `?since=` and is part of the list payload, so a plain
  //     `prisma.artikel.update({ views: { increment: 1 } })` — which fires
  //     Prisma's @updatedAt — would make every article look "changed" on
  //     every read and would bust the ETag cache continuously. Hence the
  //     raw UPDATE below, which writes `views` and nothing else.
  //
  //  2. It should not cost one DB write per article read. Increments are
  //     accumulated in memory and flushed in a single batched statement.
  //     A flush lost to a crash costs a few view counts — acceptable.

  /** artikelId → pending increment, drained by {@link flushViews}. */
  private readonly pendingViews = new Map<number, number>();
  private viewFlushTimer?: NodeJS.Timeout;
  private static readonly VIEW_FLUSH_MS = 30_000;

  onModuleInit(): void {
    this.viewFlushTimer = setInterval(() => {
      void this.flushViews();
    }, ArtikelService.VIEW_FLUSH_MS);
    // Don't hold the event loop open (matters for tests + graceful shutdown).
    this.viewFlushTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.viewFlushTimer) clearInterval(this.viewFlushTimer);
    await this.flushViews();
  }

  /** Queue a view increment for the next flush. */
  private bumpView(id: number): void {
    this.pendingViews.set(id, (this.pendingViews.get(id) ?? 0) + 1);
  }

  /**
   * Write every buffered increment in one statement. Exposed (not private)
   * so tests can force a flush instead of waiting for the timer.
   */
  async flushViews(): Promise<void> {
    if (!this.pendingViews.size) return;
    const batch = [...this.pendingViews.entries()];
    this.pendingViews.clear();

    const ids = batch.map(([id]) => id);
    const incs = batch.map(([, n]) => n);
    try {
      // Raw on purpose: bypasses Prisma's @updatedAt. See the note above.
      await this.prisma.$executeRaw`
        UPDATE artikel AS a
           SET views = a.views + v.inc
          FROM (
            SELECT UNNEST(${ids}::int[]) AS id, UNNEST(${incs}::int[]) AS inc
          ) AS v
         WHERE a.id = v.id`;
    } catch {
      // Re-queue so the next tick retries rather than dropping the counts.
      for (const [id, n] of batch) {
        this.pendingViews.set(id, (this.pendingViews.get(id) ?? 0) + n);
      }
    }
  }

  // ─── Scheduled publish (lazy promotion) ──────────────────────────────
  // No cron infra on this deployment, so articles with status="scheduled"
  // are promoted to "published" opportunistically whenever the public portal
  // is hit (list/detail). Throttled so we run at most one cheap query per
  // window even under heavy traffic.
  private lastScheduledSweep = 0;
  private static readonly SCHEDULE_SWEEP_MS = 30_000; // 30s

  /** Promote any "scheduled" article whose time has come. Fire-and-forget;
   *  sends the publish notification once per promoted article. */
  async promoteDueScheduled(): Promise<void> {
    const now = Date.now();
    if (now - this.lastScheduledSweep < ArtikelService.SCHEDULE_SWEEP_MS) return;
    this.lastScheduledSweep = now;
    try {
      const due = await this.prisma.artikel.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
        select: { id: true, judul: true, slug: true, ringkasan: true, coverUrl: true, publishedAt: true },
      });
      for (const row of due) {
        const updated = await this.prisma.artikel.update({
          where: { id: row.id },
          data: { status: 'published', publishedAt: row.publishedAt ?? new Date() },
        });
        if (!row.publishedAt) void this.notifyPublished(updated).catch(() => undefined);
      }
    } catch {
      /* best-effort; the next sweep retries */
    }
  }

  /** Resolve a slug that doesn't collide with another article. Appends
   *  "-2", "-3"… so a clashing title doesn't 409 — the admin's intent
   *  (publish now) wins over a perfect slug. */
  private async uniqueSlug(base: string, ignoreId?: number): Promise<string> {
    let candidate = base;
    for (let i = 2; i <= 200; i++) {
      const clash = await this.prisma.artikel.findFirst({
        where: { slug: candidate, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
  }

  // ─── Kategori ────────────────────────────────────────────────────────

  async listKategori(onlyActive = false): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.artikelKategori.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
      include: {
        _count: {
          select: {
            artikel: onlyActive
              ? { where: { status: 'published' } }
              : true,
          },
        },
      },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        nama: r.nama,
        deskripsi: r.deskripsi,
        urutan: r.urutan,
        isActive: r.isActive,
        jumlahArtikel: r._count.artikel,
      })),
      'Daftar kategori artikel',
    );
  }

  async createKategori(dto: CreateKategoriDto): Promise<ResponsePayload<unknown>> {
    try {
      const row = await this.prisma.artikelKategori.create({ data: dto });
      return ok(row, `Kategori '${row.nama}' dibuat`);
    } catch (err) {
      throw this.mapKnownError(err, `Slug '${dto.slug}'`);
    }
  }

  async updateKategori(
    id: number,
    dto: UpdateKategoriDto,
  ): Promise<ResponsePayload<unknown>> {
    await this.ensureKategori(id);
    const row = await this.prisma.artikelKategori.update({
      where: { id },
      data: dto,
    });
    return ok(row, 'Kategori diperbarui');
  }

  async deleteKategori(id: number): Promise<ResponsePayload<unknown>> {
    await this.ensureKategori(id);
    // FK is ON DELETE SET NULL, so articles survive (become uncategorized).
    await this.prisma.artikelKategori.delete({ where: { id } });
    return ok({ id }, 'Kategori dihapus');
  }

  private async ensureKategori(id: number): Promise<void> {
    const exists = await this.prisma.artikelKategori.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({
        message: `Kategori #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
  }

  /** Cari master penulis bersama (SerambiAuthor) by id; 400 kalau tak ada. */
  private async resolveAuthor(
    authorId?: string,
  ): Promise<{ id: string; name: string } | null> {
    if (!authorId) return null;
    const author = await this.prisma.serambiAuthor.findUnique({
      where: { id: authorId },
      select: { id: true, name: true },
    });
    if (!author) {
      throw new BadRequestException({
        message: `Penulis #${authorId} tidak ditemukan`,
        error: 'BAD_REQUEST',
      });
    }
    return author;
  }

  // ─── Artikel: list ───────────────────────────────────────────────────

  /** @param publicOnly when true, force status=published (ignores ?status). */
  async list(
    query: ArtikelListQueryDto,
    publicOnly: boolean,
  ): Promise<ResponsePayload<unknown>> {
    // Public hits drive the lazy scheduled-publish promotion (no cron infra).
    if (publicOnly) void this.promoteDueScheduled();

    const where: Prisma.ArtikelWhereInput = {};

    if (publicOnly) {
      where.status = 'published';
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.kategori) {
      where.category = { slug: query.kategori };
    }
    if (query.tag) {
      where.tags = { has: query.tag };
    }
    if (typeof query.featured === 'boolean') {
      where.isFeatured = query.featured;
    }
    if (query.q) {
      where.OR = [
        { judul: { contains: query.q, mode: 'insensitive' } },
        { ringkasan: { contains: query.q, mode: 'insensitive' } },
        { tags: { has: query.q.toLowerCase() } },
      ];
    }
    if (query.since) {
      const d = new Date(query.since);
      if (!isNaN(d.getTime())) where.updatedAt = { gt: d };
    }

    // Published list ordered by publish date; admin list by recency.
    const orderBy: Prisma.ArtikelOrderByWithRelationInput[] = publicOnly
      ? [{ publishedAt: 'desc' }, { id: 'desc' }]
      : [{ updatedAt: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.artikel.count({ where }),
      this.prisma.artikel.findMany({
        where,
        orderBy,
        select: LIST_SELECT,
        ...paginationArgs(query),
      }),
    ]);

    // Public clients (mobile app) need absolute cover URLs; admin keeps the
    // raw relative paths so its edit form round-trips correctly.
    const data = publicOnly ? rows.map((r) => this.withCoverVariants(r)) : rows;
    return ok(data, 'Daftar artikel', paginationMeta(query, total));
  }

  /**
   * Hub payload for the app's article landing page: the three lists it used
   * to fetch in parallel (latest, categories, featured) rolled into one
   * ETag'd response. The standalone endpoints stay for older app builds.
   *
   * @param limit how many "latest" articles to include (page 1).
   */
  async hub(limit = 10): Promise<ResponsePayload<unknown>> {
    void this.promoteDueScheduled();

    const [latest, featured, kategori] = await this.prisma.$transaction([
      this.prisma.artikel.findMany({
        where: { status: 'published' },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: LIST_SELECT,
      }),
      this.prisma.artikel.findMany({
        where: { status: 'published', isFeatured: true },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: LIST_SELECT,
      }),
      this.prisma.artikelKategori.findMany({
        where: { isActive: true },
        orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
        include: {
          _count: { select: { artikel: { where: { status: 'published' } } } },
        },
      }),
    ]);

    return ok(
      {
        artikel: latest.map((r) => this.withCoverVariants(r)),
        featured: featured.map((r) => this.withCoverVariants(r)),
        kategori: kategori.map((r) => ({
          id: r.id,
          slug: r.slug,
          nama: r.nama,
          deskripsi: r.deskripsi,
          urutan: r.urutan,
          isActive: r.isActive,
          jumlahArtikel: r._count.artikel,
        })),
      },
      'Hub artikel',
    );
  }

  // ─── Artikel: detail ─────────────────────────────────────────────────

  /** Public detail by slug. Only published articles are visible; increments
   *  the view counter (fire-and-forget) on each successful read. */
  async getBySlug(
    slug: string,
    ip = '',
  ): Promise<ResponsePayload<unknown>> {
    // A scheduled article whose time has come should be readable immediately.
    await this.promoteDueScheduled();
    const row = await this.prisma.artikel.findFirst({
      where: { slug, status: 'published' },
      include: { category: { select: { id: true, slug: true, nama: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Artikel '${slug}' tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }

    // Count one view per IP per 30-min window (refresh doesn't inflate).
    // Buffered — nothing hits the DB here, and `updatedAt` stays untouched.
    if (this.shouldCountView(ip, slug)) this.bumpView(row.id);

    // Related: same category or shared tag, newest first, excluding self.
    // Falls back to "other recent published" when the article has neither.
    const relatedOr: Prisma.ArtikelWhereInput[] = [];
    if (row.categoryId) relatedOr.push({ categoryId: row.categoryId });
    if (row.tags.length) relatedOr.push({ tags: { hasSome: row.tags } });
    const related = await this.prisma.artikel.findMany({
      where: {
        status: 'published',
        id: { not: row.id },
        ...(relatedOr.length ? { OR: relatedOr } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: 4,
      select: LIST_SELECT,
    });

    return ok(
      {
        ...this.withCoverVariants(row),
        ogImage: this.absUrl(row.ogImage),
        konten: this.absBody(row.konten),
        // Stored value only — deliberately NOT the live "+1". A per-request
        // value would change the payload on every read and the ETag with it,
        // so the detail cache would never hit. `views` is also excluded from
        // the ETag hash (see @ETagCacheable in the controller).
        views: row.views,
        related: related.map((r) => this.withCoverVariants(r)),
      },
      'Detail artikel',
    );
  }

  /** Admin detail by id (any status). */
  async getById(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.artikel.findUnique({
      where: { id },
      include: { category: { select: { id: true, slug: true, nama: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Artikel #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Detail artikel');
  }

  // ─── Artikel: create / update / delete ───────────────────────────────

  /** Resolve the (status, publishedAt, scheduledAt) triple for a target status,
   *  collapsing a past/missing schedule into an immediate publish. */
  private resolvePublishState(
    status: string,
    scheduledAtRaw: string | null | undefined,
    currentPublishedAt: Date | null,
  ): {
    status: string;
    publishedAt: Date | null;
    scheduledAt: Date | null;
    justPublished: boolean;
  } {
    const now = new Date();
    if (status === 'scheduled') {
      const when = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
      if (when && !isNaN(when.getTime()) && when.getTime() > now.getTime()) {
        return { status: 'scheduled', publishedAt: currentPublishedAt, scheduledAt: when, justPublished: false };
      }
      status = 'published'; // missing/past schedule → go live now
    }
    if (status === 'published') {
      return {
        status: 'published',
        publishedAt: currentPublishedAt ?? now,
        scheduledAt: null,
        justPublished: !currentPublishedAt,
      };
    }
    return { status: 'draft', publishedAt: currentPublishedAt, scheduledAt: null, justPublished: false };
  }

  async create(dto: CreateArtikelDto): Promise<ResponsePayload<unknown>> {
    const konten = sanitizeArticleHtml(dto.konten);
    const ringkasan = dto.ringkasan?.trim() || autoExcerpt(konten);

    if (dto.categoryId) await this.ensureKategori(dto.categoryId);

    const pub = this.resolvePublishState(dto.status ?? 'draft', dto.scheduledAt, null);
    const slug = await this.uniqueSlug(dto.slug);

    // Master penulis bersama: bila dipilih, nama disnapshot ke `penulis`.
    const picked = await this.resolveAuthor(dto.authorId);

    try {
      const row = await this.prisma.artikel.create({
        data: {
          slug,
          judul: dto.judul,
          ringkasan,
          konten,
          coverUrl: dto.coverUrl,
          coverAlt: dto.coverAlt,
          penulis: picked?.name ?? dto.penulis,
          authorId: picked?.id ?? null,
          status: pub.status,
          isFeatured: dto.isFeatured ?? false,
          tags: normalizeTags(dto.tags),
          menitBaca: estimateReadingMinutes(konten),
          publishedAt: pub.publishedAt,
          scheduledAt: pub.scheduledAt,
          metaTitle: dto.metaTitle || null,
          metaDescription: dto.metaDescription || null,
          ogImage: dto.ogImage || null,
          categoryId: dto.categoryId ?? null,
        },
      });
      // Went live now → announce once (fire-and-forget).
      if (pub.justPublished) {
        void this.notifyPublished(row).catch(() => undefined);
      }
      return ok(row, `Artikel '${row.judul}' dibuat`);
    } catch (err) {
      throw this.mapKnownError(err, `Slug '${slug}'`);
    }
  }

  async update(
    id: number,
    dto: UpdateArtikelDto,
  ): Promise<ResponsePayload<unknown>> {
    const current = await this.prisma.artikel.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException({
        message: `Artikel #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    if (dto.categoryId) await this.ensureKategori(dto.categoryId);

    const data: Prisma.ArtikelUpdateInput = {};
    if (dto.slug !== undefined) data.slug = await this.uniqueSlug(dto.slug, id);
    if (dto.judul !== undefined) data.judul = dto.judul;
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl || null;
    if (dto.coverAlt !== undefined) data.coverAlt = dto.coverAlt || null;
    if (dto.penulis !== undefined) data.penulis = dto.penulis || null;
    // authorId: non-kosong → pilih master (salin nama ke `penulis`);
    // '' → lepas referensi tanpa mengubah nama yang sudah tersimpan.
    if (dto.authorId !== undefined) {
      if (dto.authorId === '') {
        data.author = { disconnect: true };
      } else {
        const picked = await this.resolveAuthor(dto.authorId);
        if (picked) {
          data.author = { connect: { id: picked.id } };
          data.penulis = picked.name;
        }
      }
    }
    if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
    if (dto.tags !== undefined) data.tags = normalizeTags(dto.tags);
    if (dto.metaTitle !== undefined) data.metaTitle = dto.metaTitle || null;
    if (dto.metaDescription !== undefined) data.metaDescription = dto.metaDescription || null;
    if (dto.ogImage !== undefined) data.ogImage = dto.ogImage || null;

    if (dto.konten !== undefined) {
      const konten = sanitizeArticleHtml(dto.konten);
      data.konten = konten;
      data.menitBaca = estimateReadingMinutes(konten);
      // Refresh auto-excerpt only when the admin left ringkasan untouched/empty.
      if (dto.ringkasan === undefined && !current.ringkasan) {
        data.ringkasan = autoExcerpt(konten);
      }
    }
    if (dto.ringkasan !== undefined) {
      data.ringkasan =
        dto.ringkasan.trim() ||
        autoExcerpt(
          dto.konten !== undefined ? sanitizeArticleHtml(dto.konten) : current.konten,
        );
    }

    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }

    // Status / schedule transitions. Handles draft⇄scheduled⇄published and
    // re-scheduling (changing scheduledAt while staying "scheduled").
    let justPublished = false;
    const statusChanged = dto.status !== undefined && dto.status !== current.status;
    const targetStatus = dto.status ?? current.status;
    const rescheduling = dto.scheduledAt !== undefined && targetStatus === 'scheduled';
    if (statusChanged || rescheduling) {
      const pub = this.resolvePublishState(
        targetStatus,
        dto.scheduledAt ?? current.scheduledAt?.toISOString() ?? null,
        current.publishedAt,
      );
      data.status = pub.status;
      data.publishedAt = pub.publishedAt;
      data.scheduledAt = pub.scheduledAt;
      justPublished = pub.justPublished; // first time live → notify after the write lands
    }

    try {
      const row = await this.prisma.artikel.update({ where: { id }, data });
      // Announce the first publish only (re-publishing an article that already
      // went live before won't re-notify — publishedAt is already set).
      if (justPublished) {
        void this.notifyPublished(row).catch(() => undefined);
      }
      // Clean up inline images dropped from the body in this edit, plus the
      // previous cover when it was replaced/cleared.
      const removed: string[] = [];
      if (typeof data.konten === 'string') {
        const before = extractArtikelUploadUrls(current.konten);
        const after = new Set(extractArtikelUploadUrls(data.konten));
        removed.push(...before.filter((u) => !after.has(u)));
      }
      if (
        dto.coverUrl !== undefined &&
        current.coverUrl &&
        current.coverUrl !== row.coverUrl
      ) {
        removed.push(current.coverUrl);
      }
      void this.cleanupOrphans(removed);
      return ok(row, 'Artikel diperbarui');
    } catch (err) {
      throw this.mapKnownError(err, `Slug '${dto.slug ?? current.slug}'`);
    }
  }

  async remove(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.artikel.findUnique({
      where: { id },
      select: { id: true, coverUrl: true, konten: true },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Artikel #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.prisma.artikel.delete({ where: { id } });
    // Best-effort cleanup of the cover + every inline image, but only files no
    // other article still references (cleanupOrphans checks before unlinking).
    const urls = [...extractArtikelUploadUrls(row.konten)];
    if (row.coverUrl) urls.push(row.coverUrl);
    void this.cleanupOrphans(urls);
    return ok({ id }, 'Artikel dihapus');
  }

  /** Clone an article as a fresh draft (new unique slug, "(salinan)" title).
   *  Inline images stay shared — cleanupOrphans checks references before any
   *  unlink, so neither copy loses its media. */
  async duplicate(id: number): Promise<ResponsePayload<unknown>> {
    const src = await this.prisma.artikel.findUnique({ where: { id } });
    if (!src) {
      throw new NotFoundException({
        message: `Artikel #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const slug = await this.uniqueSlug(`${src.slug}-salinan`);
    const row = await this.prisma.artikel.create({
      data: {
        slug,
        judul: `${src.judul} (salinan)`,
        ringkasan: src.ringkasan,
        konten: src.konten,
        coverUrl: src.coverUrl,
        coverAlt: src.coverAlt,
        penulis: src.penulis,
        status: 'draft',
        isFeatured: false,
        tags: src.tags,
        menitBaca: src.menitBaca,
        publishedAt: null,
        scheduledAt: null,
        metaTitle: src.metaTitle,
        metaDescription: src.metaDescription,
        ogImage: src.ogImage,
        categoryId: src.categoryId,
      },
    });
    return ok(row, 'Artikel disalin sebagai draft');
  }

  /** Apply a bulk action to a set of article ids. */
  async bulkAction(dto: BulkArtikelDto): Promise<ResponsePayload<unknown>> {
    const ids = [...new Set(dto.ids)].filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) {
      throw new BadRequestException({
        message: 'Tidak ada artikel dipilih',
        error: 'BAD_REQUEST',
      });
    }
    let affected = 0;
    switch (dto.action) {
      case 'publish': {
        const rows = await this.prisma.artikel.findMany({ where: { id: { in: ids } } });
        for (const r of rows) {
          if (r.status === 'published') continue;
          const updated = await this.prisma.artikel.update({
            where: { id: r.id },
            data: { status: 'published', publishedAt: r.publishedAt ?? new Date(), scheduledAt: null },
          });
          affected++;
          if (!r.publishedAt) void this.notifyPublished(updated).catch(() => undefined);
        }
        break;
      }
      case 'draft': {
        const res = await this.prisma.artikel.updateMany({
          where: { id: { in: ids } },
          data: { status: 'draft', scheduledAt: null },
        });
        affected = res.count;
        break;
      }
      case 'feature':
      case 'unfeature': {
        const res = await this.prisma.artikel.updateMany({
          where: { id: { in: ids } },
          data: { isFeatured: dto.action === 'feature' },
        });
        affected = res.count;
        break;
      }
      case 'delete': {
        const rows = await this.prisma.artikel.findMany({
          where: { id: { in: ids } },
          select: { coverUrl: true, konten: true },
        });
        const res = await this.prisma.artikel.deleteMany({ where: { id: { in: ids } } });
        affected = res.count;
        const urls: string[] = [];
        for (const r of rows) {
          urls.push(...extractArtikelUploadUrls(r.konten));
          if (r.coverUrl) urls.push(r.coverUrl);
        }
        void this.cleanupOrphans(urls);
        break;
      }
    }
    return ok({ affected }, `${affected} artikel diperbarui`);
  }

  /** Distinct tags across all articles with usage counts (for autocomplete). */
  async listTags(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.artikel.findMany({ select: { tags: true } });
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const tags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
    return ok(tags, 'Daftar tag');
  }

  /** Unlink uploaded files that no remaining article references (body or
   *  cover). Defensive: only touches /uploads/artikel/<safe-name> files. */
  private async cleanupOrphans(urls: string[]): Promise<void> {
    for (const url of new Set(urls)) {
      if (!url || !url.includes('/uploads/artikel/')) continue;
      const path = url.slice(url.indexOf('/uploads/artikel/'));
      const stillUsed = await this.prisma.artikel
        .count({
          where: { OR: [{ konten: { contains: path } }, { coverUrl: path }] },
        })
        .catch(() => 1);
      if (stillUsed === 0) await this.unlinkUpload(path);
    }
  }

  // ─── Uploads ─────────────────────────────────────────────────────────

  /** Register an uploaded file and return its public URL. */
  registerUpload(filename: string): ResponsePayload<{ url: string }> {
    const url = `/uploads/artikel/${filename}`;
    return ok({ url }, 'Gambar diupload');
  }

  private async unlinkUpload(url: string): Promise<void> {
    if (!url.startsWith('/uploads/artikel/')) return;
    const filename = url.slice('/uploads/artikel/'.length);
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return;
    // Remove the original plus any width variants generated for it.
    const names = [filename];
    if (filename.toLowerCase().endsWith('.webp')) {
      for (const w of ARTIKEL_COVER_WIDTHS) {
        names.push(variantFilename(filename, w));
      }
    }
    for (const name of names) {
      try {
        await fsp.unlink(join(ARTIKEL_UPLOAD_DIR, name));
      } catch {
        /* file already gone */
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private mapKnownError(err: unknown, subject: string): Error {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException({
        message: `${subject} sudah dipakai`,
        error: 'CONFLICT',
      });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return new NotFoundException({
        message: 'Data tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    return err instanceof Error
      ? err
      : new BadRequestException({ message: 'Permintaan gagal', error: 'BAD_REQUEST' });
  }
}

/** Build a ~200-char plain-text excerpt from sanitized HTML. */
function autoExcerpt(html: string): string {
  const t = htmlToText(html);
  if (t.length <= 200) return t;
  const cut = t.slice(0, 200);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Lowercase, trim, dedupe, drop empties. */
function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = t.trim().toLowerCase();
    if (v) seen.add(v);
  }
  return [...seen];
}
