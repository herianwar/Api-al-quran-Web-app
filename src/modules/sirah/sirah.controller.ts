import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { SirahService } from './sirah.service';

@ApiTags('Sirah Nabawi')
@Controller('sirah')
export class SirahController {
  constructor(private readonly service: SirahService) {}

  @Get()
  @ETagCacheable(86_400)
  @ApiOperation({ summary: 'Daftar bab sirah Nabi ﷺ (kronologis)' })
  list() {
    return this.service.getAll();
  }

  @Get(':slug')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'Detail bab sirah berdasarkan slug' })
  bySlug(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }
}
