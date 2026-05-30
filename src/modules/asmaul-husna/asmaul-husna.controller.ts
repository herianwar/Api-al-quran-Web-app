import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { AsmaulHusnaService } from './asmaul-husna.service';

@ApiTags('Asmaul Husna')
@Controller('asmaul-husna')
export class AsmaulHusnaController {
  constructor(private readonly service: AsmaulHusnaService) {}

  @Get()
  @ETagCacheable(604_800)
  @ApiOperation({ summary: '99 Asmaul Husna lengkap (ETag-cacheable 1 minggu)' })
  getAll() {
    return this.service.getAll();
  }

  @Get('random')
  @ApiOperation({ summary: '1 Asmaul Husna random' })
  random() {
    return this.service.getRandom();
  }

  @Get(':id')
  @ETagCacheable(604_800)
  @ApiOperation({ summary: '1 Asmaul Husna berdasarkan id (1-99)' })
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id);
  }

  @Get(':id/audio')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Content-Type', 'audio/mpeg')
  @ApiOperation({
    summary: 'Stream MP3 bacaan 1 Asmaul Husna (server-side TTS, espeak-ng)',
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
