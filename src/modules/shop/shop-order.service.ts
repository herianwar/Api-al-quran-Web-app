import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import {
  paginationArgs,
  paginationMeta,
} from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateOrderDto,
  CreateOrderFieldDto,
  OrderListQueryDto,
  ORDER_STATUSES,
  ReorderFieldsDto,
  UpdateOrderFieldDto,
  UpdateOrderStatusDto,
} from './dto/shop.dto';
import { ShopService } from './shop.service';

/** A single submitted field value, snapshotted with its label + type so the
 * order report stays readable even if the form is later changed. */
interface OrderFieldValue {
  key: string;
  label: string;
  type: string;
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_VALUE_LEN = 2000;

@Injectable()
export class ShopOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
  ) {}

  // ─── Form builder (fields) ──────────────────────────────────────────

  async listFields(onlyActive = false): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.shopOrderField.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return ok(rows, 'Daftar field form order', { total: rows.length });
  }

  async createField(
    dto: CreateOrderFieldDto,
  ): Promise<ResponsePayload<unknown>> {
    this.assertOptionsForSelect(dto.type, dto.options);
    try {
      const row = await this.prisma.shopOrderField.create({
        data: {
          key: dto.key,
          label: dto.label,
          type: dto.type ?? 'text',
          placeholder: dto.placeholder,
          helpText: dto.helpText,
          required: dto.required ?? true,
          options: dto.options ?? undefined,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
      });
      return ok(row, `Field '${row.label}' dibuat`);
    } catch (err) {
      throw this.mapFieldError(err, dto.key);
    }
  }

  async updateField(
    id: number,
    dto: UpdateOrderFieldDto,
  ): Promise<ResponsePayload<unknown>> {
    if (dto.type || dto.options) {
      // Validate options against the effective type after the update.
      const existing = await this.prisma.shopOrderField.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException({
          message: `Field #${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      this.assertOptionsForSelect(
        dto.type ?? existing.type,
        dto.options ?? (existing.options as string[] | null) ?? undefined,
      );
    }
    try {
      const row = await this.prisma.shopOrderField.update({
        where: { id },
        data: {
          key: dto.key,
          label: dto.label,
          type: dto.type,
          placeholder: dto.placeholder,
          helpText: dto.helpText,
          required: dto.required,
          options: dto.options ?? undefined,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
      });
      return ok(row, `Field '${row.label}' diupdate`);
    } catch (err) {
      throw this.mapFieldError(err, dto.key, id);
    }
  }

  async deleteField(id: number): Promise<ResponsePayload<unknown>> {
    try {
      await this.prisma.shopOrderField.delete({ where: { id } });
      return ok({ deleted: id }, 'Field dihapus');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Field #${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      throw err;
    }
  }

  async reorderFields(dto: ReorderFieldsDto): Promise<ResponsePayload<unknown>> {
    const existing = await this.prisma.shopOrderField.findMany({
      select: { id: true },
    });
    const valid = new Set(existing.map((f) => f.id));
    for (const id of dto.fieldIds) {
      if (!valid.has(id)) {
        throw new BadRequestException({
          message: `Field #${id} tidak ada`,
          error: 'BAD_REQUEST',
        });
      }
    }
    await this.prisma.$transaction(
      dto.fieldIds.map((id, idx) =>
        this.prisma.shopOrderField.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );
    return ok({ updated: dto.fieldIds.length }, 'Urutan field tersimpan');
  }

  // ─── Public order submission ────────────────────────────────────────

  async createOrder(
    dto: CreateOrderDto,
    userId?: string,
  ): Promise<ResponsePayload<unknown>> {
    const settings = await this.shop.getRawSettings();
    if (settings.order_mode !== 'form') {
      throw new BadRequestException({
        message: 'Pemesanan via form sedang tidak aktif.',
        error: 'BAD_REQUEST',
      });
    }

    const fields = await this.prisma.shopOrderField.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    if (fields.length === 0) {
      throw new BadRequestException({
        message: 'Form order belum dikonfigurasi. Hubungi admin.',
        error: 'BAD_REQUEST',
      });
    }

    const raw = dto.fields ?? {};
    const values: OrderFieldValue[] = [];
    for (const f of fields) {
      const present = Object.prototype.hasOwnProperty.call(raw, f.key);
      const value = present ? this.coerce(raw[f.key]) : '';
      if (!value) {
        if (f.required) {
          throw new BadRequestException({
            message: `Field '${f.label}' wajib diisi.`,
            error: 'BAD_REQUEST',
          });
        }
        continue; // optional + empty → skip
      }
      if (value.length > MAX_VALUE_LEN) {
        throw new BadRequestException({
          message: `Field '${f.label}' terlalu panjang.`,
          error: 'BAD_REQUEST',
        });
      }
      this.validateValue(f, value);
      values.push({ key: f.key, label: f.label, type: f.type, value });
    }

    const quantity = dto.quantity ?? 1;

    // Resolve product snapshot (optional).
    let productId: number | null = null;
    let productName = 'Pesanan';
    let productSlug: string | null = null;
    let hargaIdr = 0;
    // Quantity to reserve from stock at insert time; null = product has no
    // stock tracking (stok === null → unlimited), so nothing to decrement.
    let reserveStock: number | null = null;
    if (dto.productSlug) {
      const product = await this.prisma.shopProduct.findUnique({
        where: { slug: dto.productSlug },
      });
      if (!product || !product.isActive) {
        throw new BadRequestException({
          message: `Produk '${dto.productSlug}' tidak tersedia.`,
          error: 'BAD_REQUEST',
        });
      }
      if (product.stok !== null && product.stok <= 0) {
        throw new BadRequestException({
          message: `Produk '${product.nama}' sedang habis.`,
          error: 'BAD_REQUEST',
        });
      }
      // Fast feedback before we attempt the insert; the authoritative,
      // race-safe check is the conditional decrement inside the transaction.
      if (product.stok !== null && product.stok < quantity) {
        throw new ConflictException({
          message: 'Stok tidak mencukupi',
          error: 'CONFLICT',
        });
      }
      productId = product.id;
      productName = product.nama;
      productSlug = product.slug;
      hargaIdr = product.hargaIdr;
      if (product.stok !== null) reserveStock = quantity;
    }
    const totalIdr = hargaIdr * quantity;

    const { customerName, customerPhone } = this.deriveContact(values);

    const order = await this.createWithUniqueNumber(
      {
        productId,
        productName,
        productSlug,
        hargaIdr,
        quantity,
        totalIdr,
        fields: values as unknown as Prisma.InputJsonValue,
        customerName,
        customerPhone,
        // Authenticated orders are bound to the user; anonymous ones to the
        // device. We keep deviceId too even when logged in — harmless, and it
        // lets a later anonymous lookup from the same device still match.
        deviceId: dto.deviceId ?? null,
        userId: userId ?? null,
      },
      reserveStock,
    );

    return ok(
      {
        orderNumber: order.orderNumber,
        status: order.status,
        message: settings.form_success_message,
      },
      'Pesanan berhasil dikirim',
    );
  }

  // ─── Customer order lookup ("pesanan saya") ─────────────────────────

  /** List a customer's own orders (newest first). Matched by deviceId and/or
   * the authenticated userId. At least one identifier is required. */
  async listMyOrders(opts: {
    deviceId?: string;
    userId?: string;
  }): Promise<ResponsePayload<unknown>> {
    const where = this.ownerWhere(opts);
    const rows = await this.prisma.shopOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        product: {
          select: {
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true, alt: true },
            },
          },
        },
      },
    });
    return ok(
      rows.map((o) => this.toMyOrderListItem(o)),
      'Daftar pesanan saya',
      { total: rows.length },
    );
  }

  /** Detail of one of the customer's own orders, looked up by orderNumber.
   * Returns 404 (not 403) when the order isn't owned by the caller, so we
   * don't leak whether a given order number exists. */
  async getMyOrderDetail(
    orderNumber: string,
    opts: { deviceId?: string; userId?: string },
  ): Promise<ResponsePayload<unknown>> {
    const owner = this.ownerWhere(opts);
    const row = await this.prisma.shopOrder.findFirst({
      where: { orderNumber, ...owner },
      include: {
        product: {
          select: {
            slug: true,
            nama: true,
            isActive: true,
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true, alt: true },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Pesanan '${orderNumber}' tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(
      {
        orderNumber: row.orderNumber,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        produk: {
          nama: row.productName,
          slug: row.productSlug,
          gambar: row.product?.images[0]?.url ?? null,
        },
        quantity: row.quantity,
        hargaIdr: row.hargaIdr,
        total: row.totalIdr,
        // Submitted form values (label + value), so the customer sees what
        // they entered (nama, alamat, dll).
        fields: this.readValues(row.fields),
      },
      'Detail pesanan',
    );
  }

  /** Build the ownership filter shared by the list and detail lookups. */
  private ownerWhere(opts: {
    deviceId?: string;
    userId?: string;
  }): Prisma.ShopOrderWhereInput {
    const or: Prisma.ShopOrderWhereInput[] = [];
    if (opts.userId) or.push({ userId: opts.userId });
    if (opts.deviceId) or.push({ deviceId: opts.deviceId });
    if (or.length === 0) {
      throw new BadRequestException({
        message: 'deviceId wajib diisi (atau login terlebih dahulu).',
        error: 'BAD_REQUEST',
      });
    }
    return { OR: or };
  }

  private toMyOrderListItem(o: {
    orderNumber: string;
    status: string;
    createdAt: Date;
    productName: string;
    productSlug: string | null;
    quantity: number;
    totalIdr: number;
    product: { images: { url: string; alt: string | null }[] } | null;
  }) {
    return {
      orderNumber: o.orderNumber,
      status: o.status,
      createdAt: o.createdAt,
      produk: {
        nama: o.productName,
        slug: o.productSlug,
        gambar: o.product?.images[0]?.url ?? null,
      },
      quantity: o.quantity,
      total: o.totalIdr,
    };
  }

  // ─── Admin order management ─────────────────────────────────────────

  async listOrders(query: OrderListQueryDto): Promise<ResponsePayload<unknown>> {
    const where = this.buildOrderWhere(query);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.shopOrder.count({ where }),
      this.prisma.shopOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginationArgs(query),
      }),
    ]);
    return ok(rows, 'Daftar order', paginationMeta(query, total));
  }

  async getOrder(id: number): Promise<ResponsePayload<unknown>> {
    const row = await this.prisma.shopOrder.findUnique({
      where: { id },
      include: {
        product: { select: { slug: true, nama: true, isActive: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        message: `Order #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }
    return ok(row, 'Detail order');
  }

  async updateStatus(
    id: number,
    dto: UpdateOrderStatusDto,
  ): Promise<ResponsePayload<unknown>> {
    const existing = await this.prisma.shopOrder.findUnique({
      where: { id },
      select: { status: true, productId: true, quantity: true },
    });
    if (!existing) {
      throw new NotFoundException({
        message: `Order #${id} tidak ditemukan`,
        error: 'NOT_FOUND',
      });
    }

    // soldCount tracks units of completed orders. Adjust it only on the
    // transition in/out of 'selesai' so repeated updates never double-count.
    const wasDone = existing.status === 'selesai';
    const willBeDone = dto.status === 'selesai';
    let soldDelta = 0;
    if (!wasDone && willBeDone) soldDelta = existing.quantity;
    else if (wasDone && !willBeDone) soldDelta = -existing.quantity;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shopOrder.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.adminNote !== undefined ? { adminNote: dto.adminNote } : {}),
        },
      });
      if (soldDelta > 0 && existing.productId !== null) {
        await tx.shopProduct.update({
          where: { id: existing.productId },
          data: { soldCount: { increment: soldDelta } },
        });
      } else if (soldDelta < 0 && existing.productId !== null) {
        // Guard against going negative if soldCount was edited down manually.
        await tx.shopProduct.updateMany({
          where: { id: existing.productId, soldCount: { gte: -soldDelta } },
          data: { soldCount: { decrement: -soldDelta } },
        });
      }
      return updated;
    });
    return ok(row, `Status order ${row.orderNumber} → ${row.status}`);
  }

  async deleteOrder(id: number): Promise<ResponsePayload<unknown>> {
    try {
      await this.prisma.shopOrder.delete({ where: { id } });
      return ok({ deleted: id }, 'Order dihapus');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException({
          message: `Order #${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
      throw err;
    }
  }

  async stats(): Promise<ResponsePayload<unknown>> {
    const grouped = await this.prisma.shopOrder.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const s of ORDER_STATUSES) byStatus[s] = 0;
    let total = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const [todayCount, revenueAgg] = await this.prisma.$transaction([
      this.prisma.shopOrder.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      this.prisma.shopOrder.aggregate({
        _sum: { totalIdr: true },
        where: { status: { not: 'batal' } },
      }),
    ]);
    return ok(
      {
        total,
        today: todayCount,
        baru: byStatus.baru,
        byStatus,
        revenueIdr: revenueAgg._sum.totalIdr ?? 0,
      },
      'Statistik order',
    );
  }

  /** Build a CSV string of orders matching the query (no pagination). */
  async exportCsv(query: OrderListQueryDto): Promise<string> {
    const where = this.buildOrderWhere(query);
    const [orders, fields] = await this.prisma.$transaction([
      this.prisma.shopOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      this.prisma.shopOrderField.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    ]);

    // Stable column order: known fields first, then any extra keys seen in data.
    const fieldCols: { key: string; label: string }[] = fields.map((f) => ({
      key: f.key,
      label: f.label,
    }));
    const seen = new Set(fieldCols.map((c) => c.key));
    for (const o of orders) {
      for (const v of this.readValues(o.fields)) {
        if (!seen.has(v.key)) {
          seen.add(v.key);
          fieldCols.push({ key: v.key, label: v.label || v.key });
        }
      }
    }

    const header = [
      'Order Number',
      'Tanggal',
      'Status',
      'Produk',
      'Qty',
      'Total (IDR)',
      ...fieldCols.map((c) => c.label),
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const o of orders) {
      const valueMap = new Map(
        this.readValues(o.fields).map((v) => [v.key, v.value]),
      );
      const row = [
        o.orderNumber,
        o.createdAt.toISOString(),
        o.status,
        o.productName,
        String(o.quantity),
        String(o.totalIdr),
        ...fieldCols.map((c) => valueMap.get(c.key) ?? ''),
      ];
      lines.push(row.map(csvCell).join(','));
    }
    // Prepend UTF-8 BOM so Excel renders Indonesian characters correctly.
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private buildOrderWhere(
    query: OrderListQueryDto,
  ): Prisma.ShopOrderWhereInput {
    const where: Prisma.ShopOrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.productId) where.productId = query.productId;
    if (query.q) {
      where.OR = [
        { orderNumber: { contains: query.q, mode: 'insensitive' } },
        { customerName: { contains: query.q, mode: 'insensitive' } },
        { customerPhone: { contains: query.q, mode: 'insensitive' } },
        { productName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private readValues(json: Prisma.JsonValue): OrderFieldValue[] {
    if (!Array.isArray(json)) return [];
    return (json as unknown[]).filter(
      (v): v is OrderFieldValue =>
        !!v && typeof v === 'object' && 'key' in v && 'value' in v,
    );
  }

  /** Coerce an arbitrary submitted value to a trimmed string. */
  private coerce(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private validateValue(
    field: { type: string; label: string; options: Prisma.JsonValue },
    value: string,
  ): void {
    switch (field.type) {
      case 'email':
        if (!EMAIL_RE.test(value)) {
          throw new BadRequestException({
            message: `Field '${field.label}' harus berupa email yang valid.`,
            error: 'BAD_REQUEST',
          });
        }
        break;
      case 'tel':
        if (!/^[\d\s+()-]{6,20}$/.test(value)) {
          throw new BadRequestException({
            message: `Field '${field.label}' harus berupa nomor telepon yang valid.`,
            error: 'BAD_REQUEST',
          });
        }
        break;
      case 'number':
        if (!/^-?\d+(\.\d+)?$/.test(value)) {
          throw new BadRequestException({
            message: `Field '${field.label}' harus berupa angka.`,
            error: 'BAD_REQUEST',
          });
        }
        break;
      case 'select': {
        const options = Array.isArray(field.options)
          ? (field.options as unknown[]).map(String)
          : [];
        if (options.length > 0 && !options.includes(value)) {
          throw new BadRequestException({
            message: `Field '${field.label}' harus salah satu dari: ${options.join(', ')}.`,
            error: 'BAD_REQUEST',
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Best-effort extraction of name + phone from submitted values for the
   * order list columns. Looks at field type and common key substrings. */
  private deriveContact(values: OrderFieldValue[]): {
    customerName: string | null;
    customerPhone: string | null;
  } {
    let customerName: string | null = null;
    let customerPhone: string | null = null;
    for (const v of values) {
      const k = v.key.toLowerCase();
      if (!customerName && /nama|name/.test(k)) customerName = v.value;
      if (
        !customerPhone &&
        (v.type === 'tel' || /hp|phone|telp|telepon|wa|whatsapp/.test(k))
      ) {
        customerPhone = v.value;
      }
    }
    return { customerName, customerPhone };
  }

  private assertOptionsForSelect(
    type: string | undefined,
    options: string[] | undefined,
  ): void {
    if (type === 'select' && (!options || options.length === 0)) {
      throw new BadRequestException({
        message: 'Field type "select" wajib punya minimal 1 pilihan (options).',
        error: 'BAD_REQUEST',
      });
    }
  }

  private mapFieldError(err: unknown, key?: string, id?: number): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return new BadRequestException({
          message: `Key '${key}' sudah dipakai field lain`,
          error: 'CONFLICT',
        });
      }
      if (err.code === 'P2025') {
        return new NotFoundException({
          message: `Field #${id} tidak ditemukan`,
          error: 'NOT_FOUND',
        });
      }
    }
    return err;
  }

  /** Insert the order, generating a unique human-readable order number and
   * retrying a few times if the random suffix collides. */
  private async createWithUniqueNumber(
    data: Omit<Prisma.ShopOrderUncheckedCreateInput, 'orderNumber'>,
    reserveStock: number | null = null,
  ) {
    const productId = data.productId ?? null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const orderNumber = this.generateOrderNumber();
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Reserve stock atomically. The conditional updateMany only matches
          // (and decrements) when enough stock remains, so two concurrent
          // orders can't both succeed and oversell. count === 0 means another
          // request grabbed the last units between our pre-check and here.
          if (reserveStock !== null && productId !== null) {
            const reserved = await tx.shopProduct.updateMany({
              where: { id: productId, stok: { gte: reserveStock } },
              data: { stok: { decrement: reserveStock } },
            });
            if (reserved.count === 0) {
              throw new ConflictException({
                message: 'Stok tidak mencukupi',
                error: 'CONFLICT',
              });
            }
          }
          return tx.shopOrder.create({ data: { ...data, orderNumber } });
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < 5
        ) {
          continue; // collision on orderNumber — retry with a new suffix
        }
        throw err;
      }
    }
    // Should be unreachable; satisfies the type checker.
    throw new BadRequestException({
      message: 'Gagal membuat nomor order, coba lagi.',
      error: 'BAD_REQUEST',
    });
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const suffix = Math.floor(1000 + Math.random() * 9000); // 4 digits
    return `ORD-${yy}${mm}${dd}-${suffix}`;
  }
}

/** Escape a value for a CSV cell (RFC 4180). */
function csvCell(value: string): string {
  const needsQuote = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}
