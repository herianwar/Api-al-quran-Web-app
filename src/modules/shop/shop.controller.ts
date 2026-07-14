import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  CreateOrderDto,
  MyOrdersQueryDto,
  ProductListQueryDto,
} from './dto/shop.dto';
import { ShopOrderService } from './shop-order.service';
import { ShopService } from './shop.service';

@ApiTags('Shop')
@Controller('shop')
export class ShopController {
  constructor(
    private readonly shop: ShopService,
    private readonly orders: ShopOrderService,
  ) {}

  @Get('settings')
  @ETagCacheable(300)
  @ApiOperation({
    summary:
      'Setting publik toko (WA number, greeting template, title, description)',
  })
  getSettings() {
    return this.shop.getSettings();
  }

  @Get('categories')
  @ETagCacheable(300)
  @ApiOperation({ summary: 'Daftar kategori aktif' })
  getCategories() {
    return this.shop.listCategories(true);
  }

  @Get('banners')
  @ETagCacheable(300)
  @ApiOperation({
    summary:
      'Banner promosi aktif (urut sortOrder). Dipakai carousel toko di web & aplikasi.',
  })
  getBanners() {
    return this.shop.listBanners(true);
  }

  @Get('products')
  @ApiOperation({
    summary: 'Daftar produk aktif (paginated, filter kategori/featured/q)',
  })
  listProducts(@Query() query: ProductListQueryDto) {
    return this.shop.listProducts(query, true);
  }

  @Get('products/:slug')
  @ETagCacheable(120)
  @ApiOperation({ summary: 'Detail produk berdasarkan slug' })
  getProduct(@Param('slug') slug: string) {
    return this.shop.getProductBySlug(slug);
  }

  @Get('order-fields')
  @ETagCacheable(60)
  @ApiOperation({
    summary:
      'Field form order yang aktif (dipakai saat order_mode="form"). Urut sortOrder.',
  })
  getOrderFields() {
    return this.orders.listFields(true);
  }

  @Post('orders')
  // Stricter than the global 120/min — an order POST is a write that hits the
  // DB and creates a record, so cap submissions per IP to curb spam/abuse.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Submit order via form (hanya aktif jika order_mode="form"). Validasi field dinamis server-side. ' +
      'Order diikat ke userId jika login, atau ke deviceId dari body.',
  })
  createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.orders.createOrder(dto, userId);
  }

  @Get('orders')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Daftar pesanan milik device/user (urut terbaru). Sertakan ?deviceId=XXX, ' +
      'atau login untuk memuat pesanan terikat akun.',
  })
  listMyOrders(
    @Query() query: MyOrdersQueryDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.orders.listMyOrders({ deviceId: query.deviceId, userId });
  }

  @Get('orders/:orderNumber')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Detail satu pesanan milik device/user berdasarkan orderNumber. ' +
      'Butuh ?deviceId=XXX yang cocok, atau login sebagai pemilik.',
  })
  getMyOrder(
    @Param('orderNumber') orderNumber: string,
    @Query() query: MyOrdersQueryDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.orders.getMyOrderDetail(orderNumber, {
      deviceId: query.deviceId,
      userId,
    });
  }
}
