import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination';
import { HadisQudsiService } from './hadis-qudsi.service';

@ApiTags('Hadis Qudsi')
@Controller('hadis-qudsi')
export class HadisQudsiController {
  constructor(private readonly service: HadisQudsiService) {}

  @Get()
  @ETagCacheable(86_400)
  @ApiOperation({ summary: 'Daftar 40 hadis qudsi (paginated)' })
  list(@Query() pagination: PaginationQueryDto) {
    return this.service.getAll(pagination);
  }

  @Get('random')
  @ApiOperation({ summary: 'Hadis qudsi random' })
  random() {
    return this.service.getRandom();
  }

  @Get(':nomor')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: '1 hadis qudsi berdasarkan nomor' })
  byNomor(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.service.getByNomor(nomor);
  }
}
