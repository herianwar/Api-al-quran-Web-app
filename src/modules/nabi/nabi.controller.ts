import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { NabiService } from './nabi.service';

@ApiTags('Kisah 25 Nabi')
@Controller('nabi')
export class NabiController {
  constructor(private readonly service: NabiService) {}

  @Get()
  @ETagCacheable(86_400)
  @ApiOperation({ summary: 'Daftar 25 nabi (ringkasan)' })
  list() {
    return this.service.getAll();
  }

  @Get('urutan/:urutan')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'Detail kisah nabi berdasarkan urutan (1-25)' })
  byUrutan(@Param('urutan', ParseIntPipe) urutan: number) {
    return this.service.getByUrutan(urutan);
  }

  @Get(':slug')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'Detail kisah nabi berdasarkan slug' })
  bySlug(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }
}
