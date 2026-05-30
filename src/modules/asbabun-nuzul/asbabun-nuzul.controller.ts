import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { AsbabunNuzulService } from './asbabun-nuzul.service';

@ApiTags('Asbabun Nuzul')
@Controller('asbab-nuzul')
export class AsbabunNuzulController {
  constructor(private readonly service: AsbabunNuzulService) {}

  @Get(':surat')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'Asbabun nuzul semua ayat dalam 1 surat' })
  getBySurat(@Param('surat', ParseIntPipe) surat: number) {
    return this.service.getBySurah(surat);
  }

  @Get(':surat/:ayat')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'Asbabun nuzul 1 ayat (semua sumber)' })
  getByAyat(
    @Param('surat', ParseIntPipe) surat: number,
    @Param('ayat', ParseIntPipe) ayat: number,
  ) {
    return this.service.getByAyat(surat, ayat);
  }
}
