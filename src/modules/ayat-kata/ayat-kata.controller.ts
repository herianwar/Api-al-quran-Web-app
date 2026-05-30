import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { AyatKataService } from './ayat-kata.service';

@ApiTags('Kata per Kata')
@Controller('quran')
export class AyatKataController {
  constructor(private readonly service: AyatKataService) {}

  @Get('ayat/:ayatId/kata')
  @ETagCacheable(604_800)
  @ApiOperation({
    summary: 'Kata-perkata sebuah ayat (Arab + transliterasi + arti per kata)',
  })
  byAyatId(@Param('ayatId', ParseIntPipe) ayatId: number) {
    return this.service.forAyat(ayatId);
  }

  @Get('surat/:nomor/ayat/:nomorAyat/kata')
  @ETagCacheable(604_800)
  @ApiOperation({
    summary: 'Kata-perkata berdasarkan nomor surah + nomor ayat',
  })
  bySurahAndNomor(
    @Param('nomor', ParseIntPipe) nomor: number,
    @Param('nomorAyat', ParseIntPipe) nomorAyat: number,
  ) {
    return this.service.forAyatBySurahAndNomor(nomor, nomorAyat);
  }
}
