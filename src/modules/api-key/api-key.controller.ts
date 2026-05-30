import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

/**
 * Admin endpoints for managing app-level API keys. Accepts EITHER an admin
 * JWT (browser admin panel) OR the static SEED_ADMIN_KEY (CI / scripts).
 */
@ApiTags('API Keys (Admin)')
@ApiBearerAuth()
@ApiSecurity('admin-key')
@UseGuards(JwtOrAdminKeyGuard)
@SkipThrottle()
@Controller('admin/api-keys')
export class ApiKeyController {
  constructor(private readonly service: ApiKeyService) {}

  @Post()
  @ApiOperation({
    summary:
      'Buat API key baru. Raw key dikembalikan SEKALI di response; simpan baik-baik.',
  })
  create(@Body() body: CreateApiKeyDto) {
    return this.service.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List semua API key (hash tidak ditampilkan)' })
  list() {
    return this.service.list();
  }

  @Put(':id/enable')
  @ApiOperation({ summary: 'Aktifkan kembali key yang dinonaktifkan' })
  enable(@Param('id') id: string) {
    return this.service.setEnabled(id, true);
  }

  @Put(':id/disable')
  @ApiOperation({ summary: 'Nonaktifkan key (revoke sementara)' })
  disable(@Param('id') id: string) {
    return this.service.setEnabled(id, false);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus API key permanen' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
