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

  // Declared before ':slug' so "hub" isn't captured as a slug.
  // 60s to match the list endpoint (the latest-articles block dominates
  // freshness); views excluded from the hash for the same reason as list.
  @Get('hub')
  @ETagCacheable(60, { ignoreFields: ['views'] })
  @ApiOperation({
    summary:
      'Hub artikel: latest + featured + kategori dalam satu respons ber-ETag',
  })
  hub() {
    return this.service.hub();
  }

  // 60s: short enough that a freshly published article shows up promptly on
  // the hub, long enough to collapse the app's repeated tab-opens into 304s.
  // `views` is excluded from the hash — it drifts on its own and would
  // otherwise change the ETag on every counter flush.
  @Get()
  @ETagCacheable(60, { ignoreFields: ['views'] })
  @ApiOperation({
    summary:
      'Daftar artikel published (paginated, filter q/kategori/tag/featured)',
  })
  list(@Query() query: ArtikelListQueryDto) {
    return this.service.list(query, true);
  }

  // 120s: an article body rarely changes after publish, and the detail
  // payload is the heaviest of the three (full HTML + related list).
  @Get(':slug')
  @ETagCacheable(120, { ignoreFields: ['views'] })
  @ApiOperation({
    summary: 'Detail artikel published berdasarkan slug (+ artikel terkait)',
  })
  getBySlug(@Param('slug') slug: string, @Ip() ip: string) {
    return this.service.getBySlug(slug, ip);
  }
}
