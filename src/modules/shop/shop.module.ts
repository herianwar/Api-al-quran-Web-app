import { Module } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ShopAdminController } from './shop-admin.controller';
import { ShopOrderService } from './shop-order.service';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [AuthModule],
  controllers: [ShopController, ShopAdminController],
  providers: [
    ShopService,
    ShopOrderService,
    AdminKeyGuard,
    JwtAuthGuard,
    JwtOrAdminKeyGuard,
    RolesGuard,
  ],
  exports: [ShopService, ShopOrderService],
})
export class ShopModule {}
