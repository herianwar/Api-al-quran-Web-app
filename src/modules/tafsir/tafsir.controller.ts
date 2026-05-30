import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { TafsirService } from './tafsir.service';

@ApiTags('Tafsir')
@Controller('tafsir')
export class TafsirController {
  constructor(private readonly tafsirService: TafsirService) {}

  @Get('list')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'List mufassir (semua sumber tafsir)' })
  getList() {
    return this.tafsirService.getList();
  }

  @Get(':surat')
  @ETagCacheable(604_800)
  @ApiQuery({
    name: 'sumber',
    required: false,
    description: 'Slug sumber tafsir (default: kemenag)',
    example: 'kemenag',
  })
  @ApiOperation({
    summary:
      'Tafsir 1 surat lengkap. Pakai ?sumber= untuk pilih mufassir lain.',
  })
  getTafsirSurat(
    @Param('surat', ParseIntPipe) surat: number,
    @Query('sumber') sumber?: string,
  ) {
    return this.tafsirService.getTafsirSurat(surat, sumber ?? 'kemenag');
  }

  @Get(':surat/:ayat')
  @ETagCacheable(604_800)
  @ApiQuery({ name: 'sumber', required: false, example: 'kemenag' })
  @ApiOperation({ summary: 'Tafsir 1 ayat — pilih sumber via ?sumber=' })
  getTafsirAyat(
    @Param('surat', ParseIntPipe) surat: number,
    @Param('ayat', ParseIntPipe) ayat: number,
    @Query('sumber') sumber?: string,
  ) {
    return this.tafsirService.getTafsirAyat(surat, ayat, sumber ?? 'kemenag');
  }
}
