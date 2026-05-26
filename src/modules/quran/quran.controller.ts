import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuranService } from './quran.service';
import { SearchQueryDto } from './dto/search-query.dto';

@ApiTags('Quran')
@Controller('quran')
export class QuranController {
  constructor(private readonly quranService: QuranService) {}

  @Get('surat')
  @ApiOperation({ summary: 'List 114 surat' })
  getSuratList() {
    return this.quranService.getSuratList();
  }

  @Get('random')
  @ApiOperation({ summary: '1 ayat random' })
  getRandom() {
    return this.quranService.getRandom();
  }

  @Get('search')
  @ApiOperation({ summary: 'Cari ayat berdasarkan terjemah/latin/arab' })
  search(@Query() query: SearchQueryDto) {
    return this.quranService.search(query);
  }

  @Get('juz/:nomor')
  @ApiOperation({ summary: 'Ayat dalam 1 juz (1-30)' })
  getJuz(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getJuz(nomor);
  }

  @Get('halaman/:nomor')
  @ApiOperation({ summary: 'Ayat per halaman mushaf (1-604)' })
  getHalaman(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getHalaman(nomor);
  }

  @Get('surat/:nomor')
  @ApiOperation({ summary: 'Detail surat + semua ayat' })
  getSuratDetail(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getSuratDetail(nomor);
  }

  @Get('surat/:nomor/ayat/:ayat')
  @ApiOperation({ summary: '1 ayat dari surat tertentu' })
  getAyat(
    @Param('nomor', ParseIntPipe) nomor: number,
    @Param('ayat', ParseIntPipe) ayat: number,
  ) {
    return this.quranService.getAyat(nomor, ayat);
  }
}
