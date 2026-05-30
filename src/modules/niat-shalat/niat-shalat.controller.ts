import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { NiatShalatService } from './niat-shalat.service';

@ApiTags('Niat Shalat')
@Controller('niat-shalat')
export class NiatShalatController {
  constructor(private readonly service: NiatShalatService) {}

  @Get()
  @ETagCacheable(86_400)
  @ApiOperation({ summary: '5 niat shalat fardhu (Subuh-Isya)' })
  list() {
    return this.service.getAll();
  }

  @Get(':slug')
  @ETagCacheable(604_800)
  @ApiOperation({
    summary:
      'Niat shalat tertentu (niatsubuh|niatdzuhur|niatashar|niatmaghrib|niatisya)',
  })
  bySlug(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }
}
