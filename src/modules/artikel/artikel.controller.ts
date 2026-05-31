import { Controller, Get, Ip, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { ArtikelService } from './artikel.service';
import { ArtikelListQueryDto } from './dto/artikel.dto';

@ApiTags('Artikel')
@Controller('artikel')
export class ArtikelController {
  constructor(private readonly service: ArtikelService) {}

  @Get('kategori')
  @ETagCacheable(300)
  @ApiOperation({ summary: 'Daftar kategori artikel aktif (+ jumlah artikel)' })
  listKategori() {
    return this.service.listKategori(true);
  }

  @Get()
  @ApiOperation({
    summary:
      'Daftar artikel published (paginated, filter q/kategori/tag/featured)',
  })
  list(@Query() query: ArtikelListQueryDto) {
    return this.service.list(query, true);
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Detail artikel published berdasarkan slug (+ artikel terkait)',
  })
  getBySlug(@Param('slug') slug: string, @Ip() ip: string) {
    return this.service.getBySlug(slug, ip);
  }
}
