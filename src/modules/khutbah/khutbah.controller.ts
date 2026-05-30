import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { KhutbahQueryDto } from './dto/khutbah.dto';
import { KhutbahService } from './khutbah.service';

@ApiTags('Khutbah Jumat')
@Controller('khutbah')
export class KhutbahController {
  constructor(private readonly service: KhutbahService) {}

  @Get()
  @ETagCacheable(3_600)
  @ApiOperation({
    summary: 'List khutbah Jumat (paginated, filter tema, search judul)',
  })
  list(@Query() query: KhutbahQueryDto) {
    return this.service.list(query);
  }

  @Get('tema')
  @ETagCacheable(3_600)
  @ApiOperation({ summary: 'Daftar tema khutbah + count per tema' })
  temas() {
    return this.service.listTemas();
  }

  @Get('random')
  @ApiOperation({ summary: 'Khutbah random' })
  random() {
    return this.service.getRandom();
  }

  @Get(':slug')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'Detail khutbah berdasarkan slug' })
  detail(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }
}
