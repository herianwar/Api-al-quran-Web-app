import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  PaginationQueryDto,
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateBannerDto,
  CreateCategoryDto,
  CreateProductDto,
  ProductListQueryDto,
  ReorderBannersDto,
  UpdateBannerDto,
  UpdateCategoryDto,
  UpdateImageOrderDto,
  UpdateProductDto,
} from './dto/shop.dto';

/** Path resolved relative to the compiled service file at runtime. */
export const SHOP_UPLOAD_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'uploads',
  'shop',
);

/** Default values for the KV settings table. Used if admin hasn't customized. */
const DEFAULT_SETTINGS: Record<string, string> = {
  wa_number: '',
  wa_greeting:
    'Assalamu\'alaikum kak, saya tertarik dengan {produk} (Rp {harga}). Masih ada stok kak?',
  shop_title: 'Toko Rumah Qur\'an',
  shop_description:
    'Produk pilihan untuk menemani ibadah harian — mukena, sajadah, Al-Qur\'an, dan lainnya.',
  // 'wa' = tombol order membuka WhatsApp (default, perilaku lama).
  // 'form' = customer mengisi form order dinamis di situs.
  order_mode: 'wa',
  form_success_message:
    'Terima kasih! Pesanan Anda sudah kami terima dan akan segera kami proses. Kami akan menghubungi Anda untuk konfirmasi.',
  form_submit_label: 'Kirim Pesanan',
};

/** Settings keys constrained to an enum of allowed values. */
const SETTING_ENUMS: Record<string, readonly string[]> = {
  order_mode: ['wa', 'form'],
};

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Settings ──────────────────────────────────────────────────────

  async getSettings(): Promise<ResponsePayload<Record<string, string>>> {
    return ok(await this.getRawSettings(), 'Setting toko');
  }

  /** Merged settings map (defaults + DB overrides), without the envelope.
   * Used internally by the order flow to read order_mode etc. */
  async getRawSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.shopSetting.findMany();
    const merged = { ...DEFAULT_SETTINGS };
    for (const row of rows) merged[row.key] = row.value;
    return merged;
  }

  async updateSetting(
    key: string,
    value: string,
  ): Promise<ResponsePayload<unknown>> {
    if (!(key in DEFAULT_SETTINGS)) {
      throw new BadRequestException({
        message: `Key '${key}' tidak dikenal. Valid: ${Object.keys(DEFAULT_SETTINGS).join(', ')}`,
        error: 'BAD_REQUEST',
      });
    }
    if (key === 'wa_number' && value && !/^62\d{8,14}$/.test(value)) {
      throw new BadRequestException({
        message: 'wa_number harus format 62812xxxxxxx (digits only, no +)',
        error: 'BAD_REQUEST',
      });
    }
    const allowed = SETTING_ENUMS[key];
    if (allowed && !allowed.includes(value)) {
      throw new BadRequestException({
        message: `Key '${key}' hanya menerima: ${allowed.join(', ')}`,
        error: 'BAD_REQUEST',
      });
    }
    const row = await this.prisma.shopSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    return ok({ key: row.key, value: row.value }, `Setting '${key}' tersimpan`);
  }

  // ─── Categories ─────────────────────────────────────────────────────

  async listCategories(
    onlyActive = false,
  ): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.shopCategory.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { nama: 'asc' }],
      include: {
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        nama: r.nama,
        deskripsi: r.deskripsi,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        productCount: r._count.products,
      })),
      'Daftar kategori toko',
      { total: rows.length },
    );
  }

  async createCategory(
    dto: CreateCategoryDto,
  ): Promise<ResponsePayload<unknown>> {
    try {
      const row = await this.prisma.shopCategory.create({ data: dto });
      return ok(row, `Kategori '${row.nama}' dibuat`);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message: `Slug '${dto.slug}' sudah dipakai kategori lain`,
          error: 'CONFLICT',
        });
      }
      throw err;
    }
  }

  async updateCategory(
    id: number,
    dto: UpdateCategoryDto,
  ): Promise<ResponsePayload<unknown>> {
    try {
      const row = await this.prisma.shopCategory.update({
        where: { id },
        data: dto,
      });
      return ok(row, `Kategori '${row.nama}' diupdate`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          throw new NotFoundException({
            message: `Kategori #${id} tidak ditemukan`,
            error: 'NOT_FOUND',
          });
        }
        if (err.code === 'P2002') {
          throw new ConflictException({
            message: 'Slug tersebut sudah dipakai',
            error: 'CONFLICT',
          });
        }
      }
      throw err;
    }
  }

  async deleteCategory(id: number): Promise<ResponsePayload<unknown>> {
    try {
      await this.prisma.shopCategory.delete({ where: { id } });
      return ok({ deleted: id }, 'Kategori dihapus');
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          throw new NotFoundException({
            message: `Kategori #${id} tidak ditemukan`,
            error: 'NOT_FOUND',
          });
        }
        if (err.code === 'P2003') {
          throw new ConflictException({
            message:
              'Kategori masih punya produk — pindahkan/hapus produknya dulu',
            error: 'CONFLICT',
          });
        }
      }
      throw err;
    }
  }

  // ─── Products ───────────────────────────────────────────────────────

  async listProducts(
    query: ProductListQueryDto,
    onlyActive = false,
  ): Promise<ResponsePayload<unknown>> {
    const where: Prisma.ShopProductWhereInput = {};
    if (onlyActive) where.isActive = true;
    if (query.category) where.category = { slug: query.category };
    if (query.featured) where.isFeatured = true;
    if (query.q) {
      where.OR = [
        { nama: { contains: query.q, mode: 'insensitive' } },
        { deskripsi: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.shopProduct.count({ where }),
      this.prisma.shopProduct.findMany({
        where,
        orderBy: [
          { isFeatured: 'desc' },
          { sortOrder: 'asc' },
          { createdAt: 'desc' },
        ],
        include: {
          category: { select: { slug: true, nama: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
        ...paginationArgs(query),
      }),
    ]);
    return ok(rows, 'Daftar produk', paginationMeta(query, total));
  }

  async getProductBySlug(slug: string): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.shopProduct.findUnique({
      where: { slug },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Produk '${slug}' tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Produk');
  }

  async getProductById(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.shopProduct.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Produk #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Produk');
  }

  async createProduct(
    dto: CreateProductDto,
  ): Promise<ResponsePayload<unknown>> {
    try {
      const row = await this.prisma.shopProduct.create({
        data: dto,
        include: { category: true, images: true },
      });
      return ok(row, `Produk '${row.nama}' dibuat`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException({
            message: `Slug '${dto.slug}' sudah dipakai produk lain`,
            error: 'CONFLICT',
          });
        }
        if (err.code === 'P2003') {
          throw new BadRequestException({
            message: `Kategori #${dto.categoryId} tidak ada`,
            error: 'BAD_REQUEST',
          });
        }
      }
      throw err;
    }
  }

  async updateProduct(
    id: number,
    dto: UpdateProductDto,
  ): Promise<ResponsePayload<unknown>> {
    try {
      const row = await this.prisma.shopProduct.update({
        where: { id },
        data: dto,
        include: { category: true, images: true },
      });
      return ok(row, `Produk '${row.nama}' diupdate`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          throw new NotFoundException({
            message: `Produk #${id} tidak ditemukan`,
            error: 'NOT_FOUND',
          });
        }
        if (err.code === 'P2002') {
          throw new ConflictException({
            message: 'Slug tersebut sudah dipakai',
            error: 'CONFLICT',
          });
        }
      }
      throw err;
    }
  }

  async deleteProduct(id: number): Promise<ResponsePayload<unknown>> {
    // Pull image URLs first so we can delete the on-disk files after the row
    // (and cascading image rows) are removed.
    const product = await this.prisma.shopProduct.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: `Produk #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.prisma.shopProduct.delete({ where: { id } });
    for (const img of product.images) {
      await this.unlinkSafe(img.url);
    }
    return ok(
      { deleted: id, imagesRemoved: product.images.length },
      'Produk dihapus',
    );
  }

  // ─── Images ─────────────────────────────────────────────────────────

  async addProductImage(
    productId: number,
    file: { filename: string; size: number },
    alt?: string,
  ): Promise<ResponsePayload<unknown>> {
    const product = await this.prisma.shopProduct.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException({
        message: `Produk #${productId} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const url = `/uploads/shop/${file.filename}`;
    const maxOrder = await this.prisma.shopProductImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    const image = await this.prisma.shopProductImage.create({
      data: { productId, url, alt, sortOrder },
    });
    return ok(image, 'Gambar tersimpan');
  }

  async deleteProductImage(
    imageId: number,
  ): Promise<ResponsePayload<unknown>> {
    const image = await this.prisma.shopProductImage.findUnique({
      where: { id: imageId },
    });
    if (!image) {
      throw new NotFoundException({
        message: `Gambar #${imageId} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.prisma.shopProductImage.delete({ where: { id: imageId } });
    await this.unlinkSafe(image.url);
    return ok({ deleted: imageId }, 'Gambar dihapus');
  }

  async reorderImages(
    productId: number,
    dto: UpdateImageOrderDto,
  ): Promise<ResponsePayload<unknown>> {
    const product = await this.prisma.shopProduct.findUnique({
      where: { id: productId },
      include: { images: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: `Produk #${productId} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const valid = new Set(product.images.map((i) => i.id));
    for (const id of dto.imageIds) {
      if (!valid.has(id)) {
        throw new BadRequestException({
          message: `Gambar #${id} bukan milik produk #${productId}`,
          error: 'BAD_REQUEST',
        });
      }
    }
    await this.prisma.$transaction(
      dto.imageIds.map((id, idx) =>
        this.prisma.shopProductImage.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );
    return ok({ updated: dto.imageIds.length }, 'Urutan gambar tersimpan');
  }

  // ─── Banners ────────────────────────────────────────────────────────

  /** List banners. Public callers pass onlyActive=true, which also drops
   * banners without an image (nothing to render). Sorted by sortOrder. */
  async listBanners(onlyActive = false): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.shopBanner.findMany({
      where: onlyActive ? { isActive: true, NOT: { imageUrl: null } } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return ok(rows, 'Daftar banner toko', { total: rows.length });
  }

  async createBanner(dto: CreateBannerDto): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.shopBanner.create({ data: dto });
    return ok(row, 'Banner dibuat');
  }

  async updateBanner(
    id: number,
    dto: UpdateBannerDto,
  ): Promise<ResponsePayload<unknown>> {
    try {
      const row = await this.prisma.shopBanner.update({
        where: { id },
        data: dto,
      });
      return ok(row, 'Banner diupdate');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Banner #${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      throw err;
    }
  }

  async deleteBanner(id: number): Promise<ResponsePayload<unknown>> {
    const banner = await this.prisma.shopBanner.findUnique({ where: { id } });
    if (!banner) {
      throw new NotFoundException({
        message: `Banner #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    await this.prisma.shopBanner.delete({ where: { id } });
    if (banner.imageUrl) await this.unlinkSafe(banner.imageUrl);
    return ok({ deleted: id }, 'Banner dihapus');
  }

  async reorderBanners(
    dto: ReorderBannersDto,
  ): Promise<ResponsePayload<unknown>> {
    const existing = await this.prisma.shopBanner.findMany({
      select: { id: true },
    });
    const valid = new Set(existing.map((b) => b.id));
    for (const id of dto.bannerIds) {
      if (!valid.has(id)) {
        throw new BadRequestException({
          message: `Banner #${id} tidak ditemukan`,
          error: 'BAD_REQUEST',
        });
      }
    }
    await this.prisma.$transaction(
      dto.bannerIds.map((id, idx) =>
        this.prisma.shopBanner.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );
    return ok({ updated: dto.bannerIds.length }, 'Urutan banner tersimpan');
  }

  /** Attach an uploaded image to a banner, replacing (and unlinking) any
   * previous image. */
  async setBannerImage(
    bannerId: number,
    file: { filename: string },
  ): Promise<ResponsePayload<unknown>> {
    const banner = await this.prisma.shopBanner.findUnique({
      where: { id: bannerId },
    });
    if (!banner) {
      throw new NotFoundException({
        message: `Banner #${bannerId} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    const url = `/uploads/shop/${file.filename}`;
    const row = await this.prisma.shopBanner.update({
      where: { id: bannerId },
      data: { imageUrl: url },
    });
    if (banner.imageUrl && banner.imageUrl !== url) {
      await this.unlinkSafe(banner.imageUrl);
    }
    return ok(row, 'Gambar banner tersimpan');
  }

  /** Remove an upload from disk if its URL is inside our uploads dir. Safe
   * even when the file no longer exists. */
  private async unlinkSafe(url: string): Promise<void> {
    if (!url.startsWith('/uploads/shop/')) return;
    const filename = url.slice('/uploads/shop/'.length);
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return; // defense in depth
    const filepath = join(SHOP_UPLOAD_DIR, filename);
    try {
      await fsp.unlink(filepath);
    } catch {
      /* file may already be gone — ignore */
    }
  }
}
