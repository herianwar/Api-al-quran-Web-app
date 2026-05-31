import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { AdzanService } from './adzan.service';
import { AdzanQueryDto } from './dto/adzan-query.dto';

/** Streaming serves multi-100KB files; cap per IP to block scrape loops while
 *  still allowing normal repeated playback. */
const STREAM_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('Adzan')
@Controller('adzan')
export class AdzanController {
  constructor(private readonly service: AdzanService) {}

  @Get()
  @ETagCacheable(604_800)
  @ApiOperation({
    summary: 'Daftar audio adzan self-hosted (ETag-cacheable 1 minggu)',
  })
  getAll(@Query() query: AdzanQueryDto) {
    return this.service.getAll(query.jenis);
  }

  @Get(':id')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: 'Detail 1 audio adzan berdasarkan id' })
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id);
  }

  @Get(':id/audio')
  @Throttle(STREAM_THROTTLE)
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Content-Type', 'audio/mpeg')
  @ApiOperation({
    summary: 'Stream MP3 adzan dari disk lokal (self-hosted, Range-aware)',
  })
  async streamAudio(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.service.getAudioFile(id);
    const range = res.req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d+)?/.exec(range);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
        if (start >= 0 && end < file.size && start <= end) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', String(end - start + 1));
          createReadStream(file.path, { start, end }).pipe(res);
          return;
        }
      }
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(file.size));
    createReadStream(file.path).pipe(res);
  }
}
