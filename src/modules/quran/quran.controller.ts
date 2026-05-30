import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { QuranService } from './quran.service';
import { SearchQueryDto } from './dto/search-query.dto';

const ONE_DAY = 86_400;
const ONE_WEEK = 604_800;
/** Search is the heaviest read path (trigram GIN scan over 6k+ rows). Cap per
 * client IP so a tight loop can't hog the DB while metadata reads stay free. */
const SEARCH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('Quran')
@Controller('quran')
export class QuranController {
  constructor(private readonly quranService: QuranService) {}

  @Get('surat')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary:
      'List 114 surat. ETag-cacheable. Supports `?since=ISO8601` for delta sync.',
  })
  getSuratList(@Query('since') since?: string) {
    return this.quranService.getSuratList({ since });
  }

  @Get('dump')
  @ApiOperation({
    summary:
      'Dump seluruh Quran (surat+ayat+tafsir) untuk first-install Android offline cache. ~10 MB JSON, gzip via compression middleware.',
  })
  async getDump(@Res() res: Response) {
    const data = await this.quranService.getFullDump();
    // Long cache; clients should re-fetch only when ETag changes.
    res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(data);
  }

  @Get('random')
  @ApiOperation({ summary: '1 ayat random' })
  getRandom() {
    return this.quranService.getRandom();
  }

  @Get('search')
  @Throttle(SEARCH_THROTTLE)
  @ApiOperation({ summary: 'Cari ayat berdasarkan terjemah/latin/arab' })
  search(@Query() query: SearchQueryDto) {
    return this.quranService.search(query);
  }

  @Get('juz/:nomor')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({ summary: 'Ayat dalam 1 juz (1-30) — ETag-cacheable' })
  getJuz(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getJuz(nomor);
  }

  @Get('halaman/:nomor')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({ summary: 'Ayat per halaman mushaf (1-604) — ETag-cacheable' })
  getHalaman(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getHalaman(nomor);
  }

  @Get('sajdah')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary:
      'Daftar 15 ayat sajdah di Al-Qur\'an (jenis: wajibah | mukhtalaf)',
  })
  getSajdah() {
    return this.quranService.getSajdah();
  }

  @Get('surat/:nomor')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({ summary: 'Detail surat + semua ayat — ETag-cacheable' })
  getSuratDetail(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getSuratDetail(nomor);
  }

  @Get('surat/:nomor/ayat/:ayat')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({ summary: '1 ayat dari surat tertentu — ETag-cacheable' })
  getAyat(
    @Param('nomor', ParseIntPipe) nomor: number,
    @Param('ayat', ParseIntPipe) ayat: number,
  ) {
    return this.quranService.getAyat(nomor, ayat);
  }
}
