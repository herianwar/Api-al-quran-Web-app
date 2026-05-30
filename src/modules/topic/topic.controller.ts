import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { TopicAskDto, TopicAyatQueryDto } from './dto/topic-ask.dto';
import { TopicService } from './topic.service';

@ApiTags('Topic / Tematik')
@Controller('topic')
export class TopicController {
  constructor(private readonly service: TopicService) {}

  @Get()
  @ETagCacheable(604_800)
  @ApiOperation({
    summary: 'Daftar semua topik (dengan AI summary preview + curated/AI count)',
  })
  list() {
    return this.service.list();
  }

  @Get(':slug')
  @ETagCacheable(86_400)
  @ApiOperation({
    summary:
      'Detail topik + AI summary + reading plan + topik terkait (tanpa ayat)',
  })
  detail(@Param('slug') slug: string) {
    return this.service.detail(slug);
  }

  @Get(':slug/ayat')
  @ETagCacheable(86_400)
  @ApiOperation({
    summary: 'Ayat-ayat dalam topik (paginated, filter source curated|ai|all)',
  })
  getAyat(
    @Param('slug') slug: string,
    @Query() query: TopicAyatQueryDto,
  ) {
    return this.service.getAyat(slug, query, query.source ?? 'all');
  }

  /**
   * Scoped semantic search di dalam pool ayat topik. Rate-limit lebih ketat
   * dari /quran/ask karena tiap call ngumpan embedding + DB scan.
   */
  @Post(':slug/ask')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Tanya AI scoped: cari ayat di topik ini yang paling cocok pertanyaan',
  })
  ask(@Param('slug') slug: string, @Body() body: TopicAskDto) {
    return this.service.ask(slug, body.q, body.limit ?? 6);
  }
}
