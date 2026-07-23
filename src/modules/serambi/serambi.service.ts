import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  PaginationQueryDto,
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  AdminAuthorListQueryDto,
  AdminCommentListQueryDto,
  AdminPostListQueryDto,
  BulkSerambiPostDto,
  CreateCommentDto,
  CreateSerambiAuthorDto,
  CreateSerambiPostDto,
  UpdateSerambiAuthorDto,
  UpdateSerambiPostDto,
} from './dto/serambi.dto';

/** Direktori fisik upload gambar Serambi (di-serve di /uploads/serambi/*). */
export const SERAMBI_UPLOAD_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'uploads',
  'serambi',
);

/** Kolom penulis komentar yang di-join (nama publik + avatar). */
const COMMENT_USER_SELECT = {
  id: true,
  nama: true,
} satisfies Prisma.UserSelect;

type PostRow = Prisma.SerambiPostGetPayload<Record<string, never>>;
type CommentRow = Prisma.SerambiCommentGetPayload<{
  include: { user: { select: typeof COMMENT_USER_SELECT } };
}>;

@Injectable()
export class SerambiService {
  /** Base absolut untuk menjadikan /uploads/... jadi URL penuh di push. */
  private readonly publicBase: string;

  /** Throttle sweep promosi post terjadwal (mirip ArtikelService). */
  private lastScheduledSweep = 0;
  private static readonly SCHEDULE_SWEEP_MS = 30_000; // 30s

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    config: ConfigService,
  ) {
    this.publicBase = (config.get<string>('apiPublicUrl') ?? '').replace(
      /\/+$/,
      '',
    );
  }

  /** Ubah path "/uploads/..." jadi URL absolut (untuk gambar push). */
  private absUrl(url?: string | null): string | null {
    if (!url) return url ?? null;
    if (!this.publicBase || /^https?:\/\//i.test(url)) return url;
    return url.startsWith('/') ? `${this.publicBase}${url}` : url;
  }

  /**
   * Kirim FCM push ke topic "serambi" saat sebuah post terbit. Fire-and-forget:
   * dipanggil dengan `void ...catch(()=>undefined)` supaya kegagalan/keterlambatan
   * FCM tidak pernah menggagalkan atau memperlambat request admin. Kirim SEKALI
   * per transisi ke published (create-as-published atau unpublish→publish).
   */
  private async notifyPublished(row: {
    id: string;
    body: string;
    imageUrl: string | null;
  }): Promise<void> {
    const title = "Renungan baru dari Rumah Qur'an 🌿";
    const trimmed = row.body.trim();
    const body =
      trimmed.length > 120 ? `${trimmed.slice(0, 120).trimEnd()}…` : trimmed;
    const image = this.absUrl(row.imageUrl);
    const data: Record<string, string> = {
      type: 'serambi',
      id: row.id,
      deeplink: `/serambi/${row.id}`,
      title,
      body,
    };
    if (image) data.image = image;
    await this.notifications.sendToTopic('serambi', {
      title,
      body,
      data,
      imageUrl: image ?? undefined,
    });
  }

  /**
   * Tentukan (status, scheduledAt, justPublished) untuk status target.
   * - "scheduled" dengan waktu masa depan → tetap terjadwal (belum push).
   * - "scheduled" tanpa/lampau waktu → langsung tayang.
   * - "published" → tayang. "draft"/"archived" → apa adanya.
   */
  private resolveScheduleState(
    status: string,
    scheduledAtRaw: string | null | undefined,
  ): { status: string; scheduledAt: Date | null; justPublished: boolean } {
    if (status === 'scheduled') {
      const when = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
      if (when && when.getTime() > Date.now()) {
        return { status: 'scheduled', scheduledAt: when, justPublished: false };
      }
      return { status: 'published', scheduledAt: null, justPublished: true };
    }
    if (status === 'published') {
      return { status: 'published', scheduledAt: null, justPublished: true };
    }
    return { status, scheduledAt: null, justPublished: false };
  }

  /**
   * Promosikan post "scheduled" yang waktunya sudah tiba ke "published".
   * Best-effort, di-throttle 30s, dipanggil dari feed publik (tanpa cron).
   * createdAt di-refresh ke sekarang supaya post tayang di puncak feed, dan
   * push notification dikirim sekali per post yang dipromosikan.
   */
  async promoteDueScheduled(): Promise<void> {
    const now = Date.now();
    if (now - this.lastScheduledSweep < SerambiService.SCHEDULE_SWEEP_MS) return;
    this.lastScheduledSweep = now;
    try {
      const due = await this.prisma.serambiPost.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
        select: { id: true, body: true, imageUrl: true },
      });
      for (const row of due) {
        await this.prisma.serambiPost.update({
          where: { id: row.id },
          data: { status: 'published', scheduledAt: null, createdAt: new Date() },
        });
        void this.notifyPublished(row).catch(() => undefined);
      }
    } catch {
      /* best-effort; sweep berikutnya mencoba lagi */
    }
  }

  // ─── Shape helpers (kontrak app Android) ─────────────────────────────

  /** Bentuk kartu post untuk app: author sebagai object + flag `liked`. */
  private mapPost(row: PostRow, liked: boolean) {
    return {
      id: row.id,
      body: row.body,
      imageUrl: row.imageUrl,
      author: {
        name: row.authorName,
        avatarUrl: row.authorAvatarUrl,
        verified: row.verified,
      },
      createdAt: row.createdAt,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      liked,
    };
  }

  /** Bentuk komentar untuk app: author sebagai object (tanpa userId). */
  private mapComment(row: CommentRow) {
    return {
      id: row.id,
      body: row.body,
      author: {
        name: row.user?.nama ?? 'Pengguna',
        avatarUrl: null as string | null,
      },
      createdAt: row.createdAt,
    };
  }

  /**
   * Untuk sekumpulan post, kembalikan Set id post yang sudah di-like `userId`.
   * Guest (userId null) → set kosong (semua `liked` = false).
   */
  private async likedSet(
    postIds: string[],
    userId: string | null,
  ): Promise<Set<string>> {
    if (!userId || postIds.length === 0) return new Set();
    const likes = await this.prisma.serambiLike.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    });
    return new Set(likes.map((l) => l.postId));
  }

  // ─── Publik: feed ────────────────────────────────────────────────────

  /** GET /serambi/posts — hanya published, terbaru dulu; `liked` per user. */
  async listPublic(
    query: PaginationQueryDto,
    userId: string | null,
  ): Promise<ResponsePayload<unknown>> {
    void this.promoteDueScheduled(); // tayangkan yang jatuh tempo (throttled)
    const where: Prisma.SerambiPostWhereInput = { status: 'published' };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.serambiPost.count({ where }),
      this.prisma.serambiPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginationArgs(query),
      }),
    ]);
    const liked = await this.likedSet(
      rows.map((r) => r.id),
      userId,
    );
    const data = rows.map((r) => this.mapPost(r, liked.has(r.id)));
    return ok(data, 'Daftar Serambi', paginationMeta(query, total));
  }

  /** GET /serambi/posts/:id — satu post published (dengan `liked`). */
  async getPublic(
    id: string,
    userId: string | null,
  ): Promise<ResponsePayload<unknown>> {
    void this.promoteDueScheduled(); // tayangkan yang jatuh tempo (throttled)
    const row = await this.prisma.serambiPost.findFirst({
      where: { id, status: 'published' },
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Post tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
    const liked = await this.likedSet([row.id], userId);
    return ok(this.mapPost(row, liked.has(row.id)), 'Detail post');
  }

  // ─── Publik: like / unlike (idempoten, transaksional) ────────────────

  /** POST like. Aman dipanggil dua kali — tidak menambah like ganda. */
  async like(
    postId: string,
    userId: string,
  ): Promise<ResponsePayload<{ liked: boolean; likeCount: number }>> {
    await this.ensurePublished(postId);
    const likeCount = await this.prisma.$transaction(async (tx) => {
      // createMany + skipDuplicates → no-op kalau sudah like (idempoten).
      const created = await tx.serambiLike.createMany({
        data: [{ postId, userId }],
        skipDuplicates: true,
      });
      if (created.count > 0) {
        const p = await tx.serambiPost.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
        return p.likeCount;
      }
      const p = await tx.serambiPost.findUnique({
        where: { id: postId },
        select: { likeCount: true },
      });
      return p?.likeCount ?? 0;
    });
    return ok({ liked: true, likeCount }, 'Post disukai');
  }

  /** DELETE like. Aman dipanggil walau belum pernah like. */
  async unlike(
    postId: string,
    userId: string,
  ): Promise<ResponsePayload<{ liked: boolean; likeCount: number }>> {
    await this.ensurePublished(postId);
    const likeCount = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.serambiLike.deleteMany({
        where: { postId, userId },
      });
      if (deleted.count > 0) {
        const p = await tx.serambiPost.update({
          where: { id: postId },
          // Jaga counter tak pernah negatif (min 0).
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
        return Math.max(0, p.likeCount);
      }
      const p = await tx.serambiPost.findUnique({
        where: { id: postId },
        select: { likeCount: true },
      });
      return p?.likeCount ?? 0;
    });
    return ok({ liked: false, likeCount }, 'Batal suka');
  }

  // ─── Publik: komentar ────────────────────────────────────────────────

  /** GET /serambi/posts/:id/comments — hanya visible, terbaru dulu. */
  async listComments(
    postId: string,
    query: PaginationQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    await this.ensurePublished(postId);
    const where: Prisma.SerambiCommentWhereInput = {
      postId,
      status: 'visible',
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.serambiComment.count({ where }),
      this.prisma.serambiComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: COMMENT_USER_SELECT } },
        ...paginationArgs(query),
      }),
    ]);
    const data = rows.map((r) => this.mapComment(r));
    return ok(data, 'Daftar komentar', paginationMeta(query, total));
  }

  /** POST komentar — userId dari JWT, increment commentCount transaksional. */
  async addComment(
    postId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<ResponsePayload<unknown>> {
    await this.ensurePublished(postId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serambiComment.create({
        data: { postId, userId, body: dto.body },
        include: { user: { select: COMMENT_USER_SELECT } },
      });
      await tx.serambiPost.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });
      return created;
    });
    return ok(this.mapComment(row), 'Komentar terkirim');
  }

  // ─── Admin: post CRUD ────────────────────────────────────────────────

  /**
   * Terjemahkan `?sort=` jadi orderBy Prisma. Setiap cabang menyisakan
   * `id desc` sebagai tiebreaker supaya paginasi tetap stabil saat kunci
   * urut seri (mis. likeCount = 0 untuk banyak post).
   */
  private resolveOrderBy(
    sort: string | undefined,
  ): Prisma.SerambiPostOrderByWithRelationInput[] {
    const tail: Prisma.SerambiPostOrderByWithRelationInput = { id: 'desc' };
    switch (sort) {
      case 'terlama':
        return [{ createdAt: 'asc' }, tail];
      case 'diperbarui':
        return [{ updatedAt: 'desc' }, tail];
      case 'disukai':
        return [{ likeCount: 'desc' }, tail];
      case 'dikomentari':
        return [{ commentCount: 'desc' }, tail];
      default:
        return [{ createdAt: 'desc' }, tail];
    }
  }

  async adminList(
    query: AdminPostListQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const where: Prisma.SerambiPostWhereInput = {};
    if (query.status) where.status = query.status;
    // "none" = post yang nama penulisnya ditulis manual (tanpa master).
    if (query.authorId === 'none') where.authorId = null;
    else if (query.authorId) where.authorId = query.authorId;
    if (query.q) {
      where.OR = [
        { body: { contains: query.q, mode: 'insensitive' } },
        { authorName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.serambiPost.count({ where }),
      this.prisma.serambiPost.findMany({
        where,
        orderBy: this.resolveOrderBy(query.sort),
        ...paginationArgs(query),
      }),
    ]);
    return ok(rows, 'Daftar post Serambi', paginationMeta(query, total));
  }

  /**
   * Ringkasan angka untuk header panel admin Serambi: jumlah per status,
   * total suka/komentar, post terjadwal berikutnya, terpopuler, sebaran
   * penulis, dan antrian moderasi komentar. Satu round-trip — dipakai kartu
   * statistik & filter cepat di /admin/serambi.
   */
  async adminStats(): Promise<ResponsePayload<unknown>> {
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const [
      total,
      published,
      draft,
      scheduled,
      archived,
      manualAuthor,
      withImage,
      totals,
      publishedLast30,
      commentsTotal,
      commentsHidden,
      nextScheduled,
      topLiked,
      authors,
    ] = await this.prisma.$transaction([
      this.prisma.serambiPost.count(),
      this.prisma.serambiPost.count({ where: { status: 'published' } }),
      this.prisma.serambiPost.count({ where: { status: 'draft' } }),
      this.prisma.serambiPost.count({ where: { status: 'scheduled' } }),
      this.prisma.serambiPost.count({ where: { status: 'archived' } }),
      this.prisma.serambiPost.count({ where: { authorId: null } }),
      this.prisma.serambiPost.count({ where: { NOT: { imageUrl: null } } }),
      this.prisma.serambiPost.aggregate({
        _sum: { likeCount: true, commentCount: true },
      }),
      this.prisma.serambiPost.count({
        where: { status: 'published', createdAt: { gte: since30 } },
      }),
      this.prisma.serambiComment.count(),
      this.prisma.serambiComment.count({ where: { status: 'hidden' } }),
      this.prisma.serambiPost.findFirst({
        where: { status: 'scheduled' },
        orderBy: { scheduledAt: 'asc' },
        select: { id: true, body: true, scheduledAt: true },
      }),
      this.prisma.serambiPost.findMany({
        where: { status: 'published' },
        orderBy: [{ likeCount: 'desc' }, { id: 'desc' }],
        take: 5,
        select: {
          id: true,
          body: true,
          likeCount: true,
          commentCount: true,
        },
      }),
      this.prisma.serambiAuthor.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          active: true,
          _count: { select: { posts: true } },
        },
      }),
    ]);

    return ok(
      {
        total,
        published,
        draft,
        scheduled,
        archived,
        manualAuthor,
        withImage,
        totalLikes: totals._sum.likeCount ?? 0,
        totalComments: totals._sum.commentCount ?? 0,
        publishedLast30,
        comments: { total: commentsTotal, hidden: commentsHidden },
        nextScheduled,
        topLiked,
        byAuthor: authors.map((a) => ({
          id: a.id,
          name: a.name,
          avatarUrl: a.avatarUrl,
          active: a.active,
          jumlahPost: a._count.posts,
        })),
      },
      'Statistik Serambi',
    );
  }

  /** Salin post jadi draft baru (like/komentar tidak ikut disalin). */
  async adminDuplicate(id: string): Promise<ResponsePayload<unknown>> {
    const src = await this.prisma.serambiPost.findUnique({ where: { id } });
    if (!src) {
      throw new NotFoundException({
        message: `Post #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const row = await this.prisma.serambiPost.create({
      data: {
        body: src.body,
        imageUrl: src.imageUrl,
        authorName: src.authorName,
        authorAvatarUrl: src.authorAvatarUrl,
        authorId: src.authorId,
        verified: src.verified,
        status: 'draft',
        scheduledAt: null,
      },
    });
    return ok(row, 'Post disalin sebagai draft');
  }

  /**
   * Aksi massal untuk sekumpulan post. Catatan: "publish" massal sengaja
   * TIDAK mengirim push notification — menerbitkan 20 post sekaligus akan
   * membanjiri pengguna dengan 20 notifikasi. Terbit satuan (row action /
   * editor) tetap mengirim push seperti biasa.
   */
  async adminBulk(dto: BulkSerambiPostDto): Promise<ResponsePayload<unknown>> {
    const ids = [...new Set(dto.ids)].filter((s) => typeof s === 'string' && s);
    if (!ids.length) {
      throw new BadRequestException({
        message: 'Tidak ada post dipilih',
        error: 'BAD_REQUEST',
      });
    }
    let affected = 0;
    switch (dto.action) {
      case 'publish': {
        const res = await this.prisma.serambiPost.updateMany({
          where: { id: { in: ids } },
          data: { status: 'published', scheduledAt: null },
        });
        affected = res.count;
        break;
      }
      case 'draft':
      case 'archive': {
        const res = await this.prisma.serambiPost.updateMany({
          where: { id: { in: ids } },
          data: {
            status: dto.action === 'draft' ? 'draft' : 'archived',
            scheduledAt: null,
          },
        });
        affected = res.count;
        break;
      }
      case 'author': {
        // Validasi dulu supaya id ngawur → 400 rapi, bukan FK error separuh jalan.
        const picked = await this.resolveAuthor(dto.authorId);
        if (!picked) {
          throw new BadRequestException({
            message: 'Pilih master penulis tujuan',
            error: 'BAD_REQUEST',
          });
        }
        const res = await this.prisma.serambiPost.updateMany({
          where: { id: { in: ids } },
          data: {
            authorId: picked.id,
            authorName: picked.name,
            authorAvatarUrl: picked.avatarUrl,
          },
        });
        affected = res.count;
        break;
      }
      case 'delete': {
        const res = await this.prisma.serambiPost.deleteMany({
          where: { id: { in: ids } },
        });
        affected = res.count;
        break;
      }
    }
    return ok({ affected }, `${affected} post diperbarui`);
  }

  async adminGet(id: string): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.serambiPost.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: `Post #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Detail post');
  }

  async adminCreate(
    dto: CreateSerambiPostDto,
  ): Promise<ResponsePayload<unknown>> {
    // Kalau admin memilih master penulis, nama & avatar diambil dari master
    // (snapshot ke post) dan menimpa input manual.
    const picked = await this.resolveAuthor(dto.authorId);
    const sched = this.resolveScheduleState(dto.status ?? 'published', dto.scheduledAt);
    const row = await this.prisma.serambiPost.create({
      data: {
        body: dto.body,
        imageUrl: dto.imageUrl ?? null,
        authorName: picked?.name ?? dto.authorName ?? undefined, // default "Rumah Qur'an"
        authorAvatarUrl:
          picked?.avatarUrl ?? dto.authorAvatarUrl ?? null,
        authorId: picked?.id ?? null,
        status: sched.status,
        scheduledAt: sched.scheduledAt,
      },
    });
    // Push topic "serambi" sekali kalau langsung terbit (fire-and-forget).
    // Post terjadwal belum kirim push — nanti saat dipromosikan.
    if (sched.justPublished) {
      void this.notifyPublished(row).catch(() => undefined);
    }
    return ok(row, sched.status === 'scheduled' ? 'Post dijadwalkan' : 'Post dibuat');
  }

  async adminUpdate(
    id: string,
    dto: UpdateSerambiPostDto,
  ): Promise<ResponsePayload<unknown>> {
    // Ambil status sebelumnya untuk mendeteksi transisi ke published.
    const prev = await this.prisma.serambiPost.findUnique({
      where: { id },
      select: { status: true, scheduledAt: true },
    });
    if (!prev) {
      throw new NotFoundException({
        message: `Post #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const data: Prisma.SerambiPostUpdateInput = {};
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl || null;
    if (dto.authorName !== undefined && dto.authorName !== '') {
      data.authorName = dto.authorName;
    }
    if (dto.authorAvatarUrl !== undefined) {
      data.authorAvatarUrl = dto.authorAvatarUrl || null;
    }
    // authorId: nilai non-kosong → pilih master (salin nama+avatar snapshot);
    // '' → lepas referensi tanpa mengubah snapshot nama/avatar yang ada.
    if (dto.authorId !== undefined) {
      if (dto.authorId === '') {
        data.author = { disconnect: true };
      } else {
        const picked = await this.resolveAuthor(dto.authorId);
        if (picked) {
          data.author = { connect: { id: picked.id } };
          data.authorName = picked.name;
          data.authorAvatarUrl = picked.avatarUrl ?? null;
        }
      }
    }
    // Status / jadwal. Hitung ulang bila status atau scheduledAt diubah.
    let justPublished = false;
    if (dto.status !== undefined || dto.scheduledAt !== undefined) {
      const targetStatus = dto.status ?? prev.status;
      const sched = this.resolveScheduleState(
        targetStatus,
        dto.scheduledAt ?? prev.scheduledAt?.toISOString() ?? undefined,
      );
      data.status = sched.status;
      data.scheduledAt = sched.scheduledAt;
      // Push SEKALI hanya saat benar-benar transisi non-published → published
      // (anti-spam). Edit post yang sudah published tidak memicu ulang.
      justPublished = sched.justPublished && prev.status !== 'published';
    }
    const row = await this.prisma.serambiPost.update({ where: { id }, data });
    if (justPublished) {
      void this.notifyPublished(row).catch(() => undefined);
    }
    return ok(row, 'Post diperbarui');
  }

  /** Hapus post → likes & comments ikut terhapus (cascade FK). */
  async adminRemove(id: string): Promise<ResponsePayload<unknown>> {
    await this.ensureExists(id);
    await this.prisma.serambiPost.delete({ where: { id } });
    return ok({ id }, 'Post dihapus');
  }

  /** Register gambar hasil upload → URL publik. */
  registerUpload(filename: string): ResponsePayload<{ url: string }> {
    return ok({ url: `/uploads/serambi/${filename}` }, 'Gambar diupload');
  }

  // ─── Master penulis ────────────────────────────────────────────────────

  /** Cari master penulis by id; lempar 404 kalau id diberi tapi tidak ada. */
  private async resolveAuthor(
    authorId?: string,
  ): Promise<{ id: string; name: string; avatarUrl: string | null } | null> {
    if (!authorId) return null;
    const author = await this.prisma.serambiAuthor.findUnique({
      where: { id: authorId },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!author) {
      throw new BadRequestException({
        message: `Penulis #${authorId} tidak ditemukan`,
        error: 'BAD_REQUEST',
      });
    }
    return author;
  }

  async adminListAuthors(
    query: AdminAuthorListQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const q = query.q?.trim();
    const where: Prisma.SerambiAuthorWhereInput = {
      ...(query.activeOnly ? { active: true } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const rows = await this.prisma.serambiAuthor.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { posts: true } } },
    });
    return ok(rows, 'Daftar penulis Serambi', { total: rows.length });
  }

  async adminCreateAuthor(
    dto: CreateSerambiAuthorDto,
  ): Promise<ResponsePayload<unknown>> {
    try {
      const row = await this.prisma.serambiAuthor.create({
        data: { name: dto.name, avatarUrl: dto.avatarUrl ?? null },
      });
      return ok(row, 'Penulis dibuat');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'Nama penulis sudah ada',
          error: 'CONFLICT',
        });
      }
      throw err;
    }
  }

  async adminUpdateAuthor(
    id: string,
    dto: UpdateSerambiAuthorDto,
  ): Promise<ResponsePayload<unknown>> {
    await this.ensureAuthorExists(id);
    const data: Prisma.SerambiAuthorUpdateInput = {};
    if (dto.name !== undefined && dto.name !== '') data.name = dto.name;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl || null;
    if (dto.active !== undefined) data.active = dto.active;
    try {
      const row = await this.prisma.serambiAuthor.update({
        where: { id },
        data,
      });
      return ok(row, 'Penulis diperbarui');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'Nama penulis sudah ada',
          error: 'CONFLICT',
        });
      }
      throw err;
    }
  }

  /** Hapus master penulis. Post lama tetap ada (authorId → NULL via FK),
   *  nama & avatar snapshot yang sudah tersimpan di post tidak berubah. */
  async adminRemoveAuthor(id: string): Promise<ResponsePayload<unknown>> {
    await this.ensureAuthorExists(id);
    await this.prisma.serambiAuthor.delete({ where: { id } });
    return ok({ id }, 'Penulis dihapus');
  }

  private async ensureAuthorExists(id: string): Promise<void> {
    const found = await this.prisma.serambiAuthor.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        message: `Penulis #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
  }

  // ─── Admin: moderasi komentar ────────────────────────────────────────

  async adminListComments(
    query: AdminCommentListQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const where: Prisma.SerambiCommentWhereInput = {};
    if (query.postId) where.postId = query.postId;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.body = { contains: query.q, mode: 'insensitive' };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.serambiComment.count({ where }),
      this.prisma.serambiComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, nama: true, email: true } },
          post: { select: { id: true, body: true } },
        },
        ...paginationArgs(query),
      }),
    ]);
    return ok(rows, 'Daftar komentar', paginationMeta(query, total));
  }

  /** Sembunyikan / tampilkan komentar. Menyembunyikan mengurangi counter. */
  async adminSetCommentStatus(
    id: string,
    status: string,
  ): Promise<ResponsePayload<unknown>> {
    const current = await this.prisma.serambiComment.findUnique({
      where: { id },
      select: { id: true, status: true, postId: true },
    });
    if (!current) {
      throw new NotFoundException({
        message: `Komentar #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serambiComment.update({
        where: { id },
        data: { status },
      });
      // Jaga commentCount hanya menghitung komentar visible.
      if (current.status !== status) {
        const delta = status === 'visible' ? 1 : -1;
        await tx.serambiPost.update({
          where: { id: current.postId },
          data: { commentCount: { increment: delta } },
        });
      }
      return updated;
    });
    return ok(row, 'Status komentar diperbarui');
  }

  /** Hapus komentar → kurangi counter kalau tadinya visible. */
  async adminRemoveComment(id: string): Promise<ResponsePayload<unknown>> {
    const current = await this.prisma.serambiComment.findUnique({
      where: { id },
      select: { id: true, status: true, postId: true },
    });
    if (!current) {
      throw new NotFoundException({
        message: `Komentar #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.serambiComment.delete({ where: { id } });
      if (current.status === 'visible') {
        await tx.serambiPost.update({
          where: { id: current.postId },
          data: { commentCount: { decrement: 1 } },
        });
      }
    });
    return ok({ id }, 'Komentar dihapus');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  /** Pastikan post ada & published (untuk aksi publik: like/komentar). */
  private async ensurePublished(id: string): Promise<void> {
    const row = await this.prisma.serambiPost.findFirst({
      where: { id, status: 'published' },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Post tidak ditemukan',
        error: 'NOT_FOUND',
      });
    }
  }

  /** Pastikan post ada (aksi admin, apapun statusnya). */
  private async ensureExists(id: string): Promise<void> {
    const row = await this.prisma.serambiPost.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Post #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
  }
}
