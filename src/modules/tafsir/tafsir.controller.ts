import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TafsirService } from './tafsir.service';

@ApiTags('Tafsir')
@Controller('tafsir')
export class TafsirController {
  constructor(private readonly tafsirService: TafsirService) {}

  @Get('list')
  @ApiOperation({ summary: 'List mufassir' })
  getList() {
    return this.tafsirService.getList();
  }

  @Get(':surat')
  @ApiOperation({ summary: 'Tafsir 1 surat lengkap' })
  getTafsirSurat(@Param('surat', ParseIntPipe) surat: number) {
    return this.tafsirService.getTafsirSurat(surat);
  }

  @Get(':surat/:ayat')
  @ApiOperation({ summary: 'Tafsir 1 ayat' })
  getTafsirAyat(
    @Param('surat', ParseIntPipe) surat: number,
    @Param('ayat', ParseIntPipe) ayat: number,
  ) {
    return this.tafsirService.getTafsirAyat(surat, ayat);
  }
}
