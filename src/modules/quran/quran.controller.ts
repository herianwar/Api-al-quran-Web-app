import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { QuranService } from './quran.service';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  AyatEntity,
  AyatWithSurahEntity,
  SurahDetailEntity,
  SurahEntity,
} from './entities/quran.entities';

const ONE_DAY = 86_400;
const ONE_WEEK = 604_800;
/** Search is the heaviest read path (trigram GIN scan over 6k+ rows). Cap per
 * client IP so a tight loop can't hog the DB while metadata reads stay free. */
const SEARCH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

/** Build an @ApiOkResponse body that wraps a model in the ApiSuccess envelope
 * (`{ success, message, data, meta? }`). ApiSuccess itself is injected at
 * document-build time in main.ts → enrichResponseSchemas(), which preserves any
 * 2xx we declare here. */
function okData(
  model: Parameters<typeof getSchemaPath>[0],
  opts: { isArray?: boolean } = {},
) {
  const data = opts.isArray
    ? { type: 'array' as const, items: { $ref: getSchemaPath(model) } }
    : { $ref: getSchemaPath(model) };
  return {
    schema: {
      allOf: [
        { $ref: '#/components/schemas/ApiSuccess' },
        { properties: { data } },
      ],
    },
  };
}

@ApiTags('Quran')
@ApiExtraModels(
  SurahEntity,
  SurahDetailEntity,
  AyatEntity,
  AyatWithSurahEntity,
)
@Controller('quran')
export class QuranController {
  constructor(private readonly quranService: QuranService) {}

  @Get('surat')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary:
      'List 114 surat. ETag-cacheable. Supports `?since=ISO8601` for delta sync.',
    description:
      'Hanya metadata surat (tanpa ayat), jadi TIDAK memuat `teksArabTajwid`. ' +
      'Tajwid ada di endpoint yang mengembalikan ayat (detail surat, ayat, juz, halaman, sajdah, search, random, dump).',
  })
  @ApiOkResponse(okData(SurahEntity, { isArray: true }))
  getSuratList(@Query('since') since?: string) {
    return this.quranService.getSuratList({ since });
  }

  @Get('dump')
  @ApiOperation({
    summary:
      'Dump seluruh Quran (surat+ayat+tafsir) untuk first-install Android offline cache. ~10 MB JSON, gzip via compression middleware.',
    description:
      'Setiap ayat memuat `teksArabTajwid` (teks Arab bertajwid berwarna, HTML `<span class="tj tj-<kaidah>">`).',
  })
  async getDump(@Res() res: Response) {
    const data = await this.quranService.getFullDump();
    // Long cache; clients should re-fetch only when ETag changes.
    res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(data);
  }

  @Get('random')
  @ApiOperation({
    summary: '1 ayat random',
    description:
      'Termasuk `teksArabTajwid` (teks Arab bertajwid berwarna).',
  })
  getRandom() {
    return this.quranService.getRandom();
  }

  @Get('search')
  @Throttle(SEARCH_THROTTLE)
  @ApiOperation({
    summary: 'Cari ayat berdasarkan terjemah/latin/arab',
    description:
      'Tiap hasil ayat memuat `teksArabTajwid` (teks Arab bertajwid berwarna).',
  })
  @ApiOkResponse(okData(AyatEntity, { isArray: true }))
  search(@Query() query: SearchQueryDto) {
    return this.quranService.search(query);
  }

  @Get('juz/:nomor')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary: 'Ayat dalam 1 juz (1-30) — ETag-cacheable',
    description: 'Tiap ayat memuat `teksArabTajwid` (teks Arab bertajwid berwarna).',
  })
  @ApiOkResponse(okData(AyatEntity, { isArray: true }))
  getJuz(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getJuz(nomor);
  }

  @Get('halaman/:nomor')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary: 'Ayat per halaman mushaf (1-604) — ETag-cacheable',
    description: 'Tiap ayat memuat `teksArabTajwid` (teks Arab bertajwid berwarna).',
  })
  @ApiOkResponse(okData(AyatEntity, { isArray: true }))
  getHalaman(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getHalaman(nomor);
  }

  @Get('sajdah')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary:
      'Daftar 15 ayat sajdah di Al-Qur\'an (jenis: wajibah | mukhtalaf)',
    description: 'Tiap ayat memuat `teksArabTajwid` (teks Arab bertajwid berwarna).',
  })
  @ApiOkResponse(okData(AyatEntity, { isArray: true }))
  getSajdah() {
    return this.quranService.getSajdah();
  }

  @Get('surat/:nomor')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary: 'Detail surat + semua ayat — ETag-cacheable',
    description:
      'Tiap ayat di `data.ayat[]` memuat `teksArabTajwid` (teks Arab bertajwid berwarna, HTML `<span class="tj tj-<kaidah>">`) di samping `teksArab` polos.',
  })
  @ApiOkResponse(okData(SurahDetailEntity))
  getSuratDetail(@Param('nomor', ParseIntPipe) nomor: number) {
    return this.quranService.getSuratDetail(nomor);
  }

  @Get('surat/:nomor/ayat/:ayat')
  @ETagCacheable(ONE_WEEK)
  @ApiOperation({
    summary: '1 ayat dari surat tertentu — ETag-cacheable',
    description:
      'Memuat `teksArabTajwid` (teks Arab bertajwid berwarna) di samping `teksArab` polos.',
  })
  @ApiOkResponse(okData(AyatWithSurahEntity))
  getAyat(
    @Param('nomor', ParseIntPipe) nomor: number,
    @Param('ayat', ParseIntPipe) ayat: number,
  ) {
    return this.quranService.getAyat(nomor, ayat);
  }
}
