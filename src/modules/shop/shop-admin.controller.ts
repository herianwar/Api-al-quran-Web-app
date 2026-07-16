import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { promises as fsp } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateBannerDto,
  CreateCategoryDto,
  CreateOrderFieldDto,
  CreateProductDto,
  OrderListQueryDto,
  ProductListQueryDto,
  ReorderBannersDto,
  ReorderFieldsDto,
  UpdateBannerDto,
  UpdateCategoryDto,
  UpdateImageOrderDto,
  UpdateOrderFieldDto,
  UpdateOrderStatusDto,
  UpdateProductDto,
  UpdateSettingDto,
} from './dto/shop.dto';
import { ShopOrderService } from './shop-order.service';
import { processImageToWebp } from '../../common/util/image';
import { SHOP_UPLOAD_DIR, ShopService } from './shop.service';

/** Allowed image MIME types for product/banner uploads. */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Shared multer config for shop image uploads (products + banners). Stores to
 * disk under SHOP_UPLOAD_DIR with a randomized filename, jpg/png/webp only. */
const shopUploadMulter = {
  storage: diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fsp.mkdir(SHOP_UPLOAD_DIR, { recursive: true });
        cb(null, SHOP_UPLOAD_DIR);
      } catch (err) {
        cb(err as Error, SHOP_UPLOAD_DIR);
      }
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const rand = Math.random().toString(36).slice(2, 10);
      cb(null, `${Date.now()}-${rand}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(
        new BadRequestException({
          message: `Mime ${file.mimetype} tidak diizinkan. Hanya jpg/png/webp.`,
          error: 'BAD_REQUEST',
        }),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

@ApiTags('Shop Admin')
@ApiBearerAuth()
@ApiSecurity('admin-key')
@UseGuards(JwtOrAdminKeyGuard, RolesGuard)
@Roles('admin')
// Admin shop ops (upload, CRUD) are already auth-gated and not subject to
// the public 120/min throttle — uploading a batch of product photos should
// not 429 the admin user.
@SkipThrottle()
@Controller('admin/shop')
export class ShopAdminController {
  constructor(
    private readonly shop: ShopService,
    private readonly orders: ShopOrderService,
  ) {}

  // ─── Settings ─────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Get all shop settings' })
  getSettings() {
    return this.shop.getSettings();
  }

  @Put('settings/:key')
  @ApiOperation({
    summary:
      'Update one setting key (wa_number | wa_greeting | shop_title | shop_description)',
  })
  updateSetting(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.shop.updateSetting(key, dto.value);
  }

  // ─── Categories ───────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'List all categories (admin — includes inactive)' })
  listCategories() {
    return this.shop.listCategories(false);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create category' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.shop.createCategory(dto);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.shop.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete category (must be empty)' })
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.shop.deleteCategory(id);
  }

  // ─── Products ─────────────────────────────────────────────────────

  @Get('products')
  @ApiOperation({ summary: 'List all products (admin — includes inactive)' })
  listProducts(@Query() query: ProductListQueryDto) {
    return this.shop.listProducts(query, false);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by id' })
  getProduct(@Param('id', ParseIntPipe) id: number) {
    return this.shop.getProductById(id);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create product' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.shop.createProduct(dto);
  }

  @Put('products/:id')
  @ApiOperation({ summary: 'Update product' })
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.shop.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete product (cascades images on disk)' })
  deleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.shop.deleteProduct(id);
  }

  // ─── Images ───────────────────────────────────────────────────────

  @Post('products/:id/images')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload product image (jpg/png/webp, max 5MB, field "file"). Auto-optimized → WebP (resize max 1200px, quality 80).',
  })
  @UseInterceptors(FileInterceptor('file', shopUploadMulter))
  async uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('alt') alt?: string,
  ) {
    if (!file) {
      throw new BadRequestException({
        message: 'File tidak ditemukan di field "file"',
        error: 'BAD_REQUEST',
      });
    }
    const { filename, size } = await processImageToWebp(
      SHOP_UPLOAD_DIR,
      file.filename,
      { maxWidth: 1200 },
    );
    return this.shop.addProductImage(id, { filename, size }, alt);
  }

  @Delete('images/:imageId')
  @ApiOperation({ summary: 'Delete single image' })
  deleteImage(@Param('imageId', ParseIntPipe) imageId: number) {
    // Construct fake productId — unused since we look up image by id directly.
    return this.shop.deleteProductImage(imageId);
  }

  @Put('products/:id/images/order')
  @ApiOperation({ summary: 'Reorder images for a product' })
  reorderImages(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateImageOrderDto,
  ) {
    return this.shop.reorderImages(id, dto);
  }

  // ─── Banners (promosi toko) ───────────────────────────────────────
  // Static 'reorder' sub-route declared before ':id' so Nest matches it
  // first instead of treating "reorder" as an id.

  @Get('banners')
  @ApiOperation({ summary: 'List all banners (admin — includes inactive)' })
  listBanners() {
    return this.shop.listBanners(false);
  }

  @Post('banners')
  @ApiOperation({ summary: 'Create banner (image uploaded separately)' })
  createBanner(@Body() dto: CreateBannerDto) {
    return this.shop.createBanner(dto);
  }

  @Put('banners/reorder')
  @ApiOperation({ summary: 'Reorder banners' })
  reorderBanners(@Body() dto: ReorderBannersDto) {
    return this.shop.reorderBanners(dto);
  }

  @Post('banners/:id/image')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload/replace banner image (jpg/png/webp, max 5MB, field "file"). Auto-optimized → WebP (resize max 1600px, quality 80).',
  })
  @UseInterceptors(FileInterceptor('file', shopUploadMulter))
  async uploadBannerImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({
        message: 'File tidak ditemukan di field "file"',
        error: 'BAD_REQUEST',
      });
    }
    const { filename } = await processImageToWebp(
      SHOP_UPLOAD_DIR,
      file.filename,
      { maxWidth: 1600 },
    );
    return this.shop.setBannerImage(id, { filename });
  }

  @Put('banners/:id')
  @ApiOperation({ summary: 'Update banner' })
  updateBanner(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.shop.updateBanner(id, dto);
  }

  @Delete('banners/:id')
  @ApiOperation({ summary: 'Delete banner (removes image on disk)' })
  deleteBanner(@Param('id', ParseIntPipe) id: number) {
    return this.shop.deleteBanner(id);
  }

  // ─── Order form builder (dynamic fields) ──────────────────────────

  @Get('order-fields')
  @ApiOperation({ summary: 'List all order form fields (incl. inactive)' })
  listOrderFields() {
    return this.orders.listFields(false);
  }

  @Post('order-fields')
  @ApiOperation({ summary: 'Create an order form field' })
  createOrderField(@Body() dto: CreateOrderFieldDto) {
    return this.orders.createField(dto);
  }

  @Put('order-fields/reorder')
  @ApiOperation({ summary: 'Reorder order form fields' })
  reorderOrderFields(@Body() dto: ReorderFieldsDto) {
    return this.orders.reorderFields(dto);
  }

  @Put('order-fields/:id')
  @ApiOperation({ summary: 'Update an order form field' })
  updateOrderField(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderFieldDto,
  ) {
    return this.orders.updateField(id, dto);
  }

  @Delete('order-fields/:id')
  @ApiOperation({ summary: 'Delete an order form field' })
  deleteOrderField(@Param('id', ParseIntPipe) id: number) {
    return this.orders.deleteField(id);
  }

  // ─── Orders (laporan) ─────────────────────────────────────────────
  // Static sub-routes (stats, export) are declared before ':id' so Nest
  // matches them first instead of treating "stats"/"export" as an id.

  @Get('orders/stats')
  @ApiOperation({ summary: 'Ringkasan order: total, hari ini, per status, omzet' })
  orderStats() {
    return this.orders.stats();
  }

  @Get('orders/export')
  @ApiOperation({
    summary: 'Export order ke CSV (filter status/q/productId). Max 5000 baris.',
  })
  async exportOrders(
    @Query() query: OrderListQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.orders.exportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="orders.csv"',
    );
    res.send(csv);
  }

  @Get('orders')
  @ApiOperation({
    summary: 'Daftar order (paginated, filter status/q/productId)',
  })
  listOrders(@Query() query: OrderListQueryDto) {
    return this.orders.listOrders(query);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Detail satu order' })
  getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orders.getOrder(id);
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Update status order (+ catatan admin opsional)' })
  updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(id, dto);
  }

  @Delete('orders/:id')
  @ApiOperation({ summary: 'Hapus order' })
  deleteOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orders.deleteOrder(id);
  }

  /** Static file fallback — used by the upload tooltip in the admin UI. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _unused() {
    void join;
  }
}
