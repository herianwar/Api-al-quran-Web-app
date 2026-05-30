import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import {
  HadithListQueryDto,
  HadithSearchQueryDto,
} from './dto/hadith-query.dto';
import { HadithService } from './hadith.service';

/** Search runs trigram GIN scans over 38k rows — tighten budget per IP. */
const SEARCH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('Hadis')
@Controller('hadith')
export class HadithController {
  constructor(private readonly hadithService: HadithService) {}

  @Get('perawi')
  @ETagCacheable(86_400)
  @ApiOperation({ summary: 'Daftar 9 perawi (Bukhari, Muslim, dst.)' })
  listPerawi() {
    return this.hadithService.listPerawi();
  }

  @Get('random')
  @ApiOperation({ summary: 'Hadis random (opsional filter ?perawi=slug)' })
  random(@Query('perawi') perawi?: string) {
    return this.hadithService.getRandom(perawi);
  }

  @Get('search')
  @Throttle(SEARCH_THROTTLE)
  @ApiOperation({ summary: 'Cari hadis lintas perawi' })
  search(@Query() query: HadithSearchQueryDto) {
    return this.hadithService.search(query);
  }

  @Get(':perawiSlug')
  @ETagCacheable(3_600)
  @ApiOperation({ summary: 'List hadis 1 perawi (paginated, opsional ?q=)' })
  listByPerawi(
    @Param('perawiSlug') perawiSlug: string,
    @Query() query: HadithListQueryDto,
  ) {
    return this.hadithService.listByPerawi(perawiSlug, query);
  }

  @Get(':perawiSlug/:nomor')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: '1 hadis berdasarkan perawi + nomor' })
  getByNomor(
    @Param('perawiSlug') perawiSlug: string,
    @Param('nomor', ParseIntPipe) nomor: number,
  ) {
    return this.hadithService.getByNomor(perawiSlug, nomor);
  }
}
