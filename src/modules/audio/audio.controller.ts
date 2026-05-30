import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { AudioCacheService } from './audio-cache.service';
import { AudioService } from './audio.service';

/** Streaming endpoints serve multi-MB files; cap per IP. 60/min allows
 * sequential play of ~1 ayat per second while still blocking scrape loops. */
const STREAM_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('Audio')
@Controller('audio')
export class AudioController {
  constructor(
    private readonly audioService: AudioService,
    private readonly audioCache: AudioCacheService,
  ) {}

  @Get('qari')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'List qari tersedia' })
  getQari() {
    return this.audioService.getQariList();
  }

  @Get('surat/:nomor')
  @ApiOperation({
    summary: 'URL audio full surat (proxy lokal, langsung dapat di-play)',
  })
  @ApiQuery({ name: 'qari', required: false, example: '05' })
  getSuratAudio(
    @Param('nomor', ParseIntPipe) nomor: number,
    @Query('qari') qari?: string,
  ) {
    return this.audioService.getSuratAudio(nomor, qari);
  }

  @Get('ayat/:surat/:ayat')
  @ApiOperation({
    summary: 'URL audio 1 ayat (proxy lokal, langsung dapat di-play)',
  })
  @ApiQuery({ name: 'qari', required: false, example: '05' })
  getAyatAudio(
    @Param('surat', ParseIntPipe) surat: number,
    @Param('ayat', ParseIntPipe) ayat: number,
    @Query('qari') qari?: string,
  ) {
    return this.audioService.getAyatAudio(surat, ayat, qari);
  }

  // ─── Stream endpoints (self-hosted, lazy cache) ─────────────────────

  @Get('stream/:qari/surah/:nomor')
  @Throttle(STREAM_THROTTLE)
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Content-Type', 'audio/mpeg')
  @ApiOperation({
    summary: 'Stream MP3 full surat dari cache lokal (fetch+cache on miss)',
  })
  async streamSurat(
    @Param('qari') qari: string,
    @Param('nomor', ParseIntPipe) nomor: number,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.audioCache.getSurah(qari, nomor);
    this.streamFile(file.path, file.size, res);
  }

  @Get('stream/:qari/ayat/:surat/:ayat')
  @Throttle(STREAM_THROTTLE)
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Content-Type', 'audio/mpeg')
  @ApiOperation({
    summary: 'Stream MP3 1 ayat dari cache lokal (fetch+cache on miss)',
  })
  async streamAyat(
    @Param('qari') qari: string,
    @Param('surat', ParseIntPipe) surat: number,
    @Param('ayat', ParseIntPipe) ayat: number,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.audioCache.getAyat(qari, surat, ayat);
    this.streamFile(file.path, file.size, res);
  }

  /**
   * Stream `path` to the response with HTTP Range support so browsers can
   * scrub/seek and resume audio playback.
   */
  private streamFile(path: string, size: number, res: Response): void {
    const range = res.req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d+)?/.exec(range);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : size - 1;
        if (start >= 0 && end < size && start <= end) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', String(end - start + 1));
          createReadStream(path, { start, end }).pipe(res);
          return;
        }
      }
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(size));
    createReadStream(path).pipe(res);
  }
}
