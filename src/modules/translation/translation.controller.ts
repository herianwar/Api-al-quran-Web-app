import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { TranslationService } from './translation.service';

const ONE_WEEK = 604_800;

@ApiTags('Translation')
@Controller('translation')
export class TranslationController {
  constructor(private readonly service: TranslationService) {}

  @Get('list')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({ summary: 'Daftar sumber terjemahan yang tersedia' })
  list() {
    return this.service.listSources();
  }

  @Get(':sumber/:surat')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary:
      'Terjemahan 1 surat lengkap. Contoh sumber: sahih-international, kemenag-2019',
  })
  getSurat(
    @Param('sumber') sumber: string,
    @Param('surat', ParseIntPipe) surat: number,
  ) {
    return this.service.getSurat(sumber, surat);
  }

  @Get(':sumber/:surat/:ayat')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({ summary: 'Terjemahan 1 ayat' })
  getAyat(
    @Param('sumber') sumber: string,
    @Param('surat', ParseIntPipe) surat: number,
    @Param('ayat', ParseIntPipe) ayat: number,
  ) {
    return this.service.getAyat(sumber, surat, ayat);
  }
}
