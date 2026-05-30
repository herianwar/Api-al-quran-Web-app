import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination';
import { DoaService } from './doa.service';

@ApiTags('Doa')
@Controller('doa')
export class DoaController {
  constructor(private readonly doaService: DoaService) {}

  @Get()
  @ETagCacheable(86_400)
  @ApiOperation({ summary: 'Semua doa & dzikir (paginated, ETag-cacheable)' })
  getAll(@Query() pagination: PaginationQueryDto) {
    return this.doaService.getAll(pagination);
  }

  @Get('random')
  @ApiOperation({ summary: 'Doa random' })
  getRandom() {
    return this.doaService.getRandom();
  }

  @Get(':id')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: '1 doa berdasarkan id — ETag-cacheable' })
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.doaService.getById(id);
  }
}
