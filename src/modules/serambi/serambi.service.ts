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

  async adminList(
    query: AdminPostListQueryDto,
  ): Promise<ResponsePayload<unknown>> {
    const where: Prisma.SerambiPostWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.body = { contains: query.q, mode: 'insensitive' };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.serambiPost.count({ where }),
      this.prisma.serambiPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginationArgs(query),
      }),
    ]);
    return ok(rows, 'Daftar post Serambi', paginationMeta(query, total));
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
    const row = await this.prisma.serambiPost.create({
      data: {
        body: dto.body,
        imageUrl: dto.imageUrl ?? null,
        authorName: picked?.name ?? dto.authorName ?? undefined, // default "Rumah Qur'an"
        authorAvatarUrl:
          picked?.avatarUrl ?? dto.authorAvatarUrl ?? null,
        authorId: picked?.id ?? null,
        status: dto.status ?? undefined, // default "published"
      },
    });
    // Push topic "serambi" sekali kalau langsung terbit (fire-and-forget).
    if (row.status === 'published') {
      void this.notifyPublished(row).catch(() => undefined);
    }
    return ok(row, 'Post dibuat');
  }

  async adminUpdate(
    id: string,
    dto: UpdateSerambiPostDto,
  ): Promise<ResponsePayload<unknown>> {
    // Ambil status sebelumnya untuk mendeteksi transisi ke published.
    const prev = await this.prisma.serambiPost.findUnique({
      where: { id },
      select: { status: true },
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
    if (dto.status !== undefined) data.status = dto.status;
    const row = await this.prisma.serambiPost.update({ where: { id }, data });
    // Push SEKALI hanya saat benar-benar transisi non-published → published
    // (mis. draft/archived → published). Edit post yang sudah published tidak
    // memicu ulang (anti-spam).
    if (prev.status !== 'published' && row.status === 'published') {
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
